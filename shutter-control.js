'use strict';

const fs         = require('fs-extra');
// const _          = require('lodash');
const log4js     = require('log4js');
const rpio       = require('rpio');

const ShutterControl = require('./lib/ShutterControl');

const {
  MqttClient,
  topics,
} = require('@jhb/smart-home-shared');

const {
  shutterMovement,
  shutterStatus,
  // windowOpenStatus,
} = topics;

rpio.init({mapping: 'gpio'});

const logger = log4js.getLogger();

logger.level = 'info';
logger.level = 'debug';

const lockFilePath = '/var/run/pigpio.pid';

try {
  // eslint-disable-next-line no-sync
  const stats = fs.statSync(lockFilePath);

  if(stats) {
    // eslint-disable-next-line no-sync
    fs.unlinkSync(lockFilePath);

    logger.warn(`Deleted lockfile [${lockFilePath}]`);
  }
} catch(err) {
  if(err.code !== 'ENOENT') {
    logger.error(`Failed to cleanup lockfile [${lockFilePath}]`, err);
  }
}

const dockerConfigPath = '../config//shutter-control/config';
const localConfigPath = '../smart-home-setup/arbeitszimmer/config/shutter-control/config';

let config = null;

try {
  config = require(dockerConfigPath);
  logger.info(`Using config [${dockerConfigPath}]`);
} catch(err) {
  logger.debug('Config fallback', err);
  config = require(localConfigPath);
  logger.info(`Using config [${localConfigPath}]`);
}

(async function() {
  const mqttClient = new MqttClient({
    url: 'tcp://raspi-arbeitszimmer:1883',
    logger,
  });

  const shutterControl = new ShutterControl({
    config,
    logger,
    mqttClient,
  });

  const handleMqttMessage = async(topic, data) => {
    logger.debug('handleMqttMessage', topic, data);

    const [
      area,
      areaId,
      element,
      elementId,
      subArea,
    ] = topic.split('/');

    if(area === 'room' && element === 'shutters' && subArea === 'movement') {
      shutterControl[data.value](areaId, elementId);
    }
  };

  await mqttClient.init(handleMqttMessage);

  for(const shutter of config.shutters) {
    await mqttClient.subscribe(shutterMovement(shutter.room.id, shutter.id));
    await mqttClient.subscribe(shutterStatus(shutter.room.id, shutter.id));
  }
  //   if(room.windows) {
  //     for(const shutter of room.windows) {
  //       await mqttClient.subscribe(windowOpenStatus(room.id, shutter.id));
  //     }
  //   }
  // }
})();
