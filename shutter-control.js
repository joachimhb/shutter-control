'use strict';

const check      = require('check-types-2');
const fs         = require('fs-extra');
const log4js     = require('log4js');
const rpio       = require('rpio');
const pigpio     = require('pigpio');

const RoomControl = require('./lib/RoomControl');

const {
  MqttClient,
  topics,
} = require('@joachimhb/smart-home-shared');

const {
  shutterUp,
  shutterDown,
  shutterStop,
  shutterStatus,
  shutterToggle,
  shutterInit,
  // shutterMoveTo,
  buttonActive,
  windowStatus,
} = topics;

const shutdown = function() {
  pigpio.terminate();
  console.log('Terminating...');
  process.exit(0);
}

process.on('SIGHUP', shutdown);
process.on('SIGINT', shutdown);
process.on('SIGCONT', shutdown);
process.on('SIGTERM', shutdown);

rpio.init({mapping: 'gpio'});

const logger = log4js.getLogger();

logger.level = 'info';
logger.level = 'debug';
// logger.level = 'trace';

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

const dockerConfigPath = '../config/shutter-control/config';
const localConfigPath = '../smart-home-setup/arbeitszimmer/config/shutter-control/config';

let config = null;

try {
  config = require(dockerConfigPath);
  logger.info(`Using config [${dockerConfigPath}]`);
} catch(err) {
  logger.trace('Config fallback', err);
  config = require(localConfigPath);
  logger.info(`Using config [${localConfigPath}]`);
}

(async function() {
  check.assert.object(config, 'config is not an object');
  check.assert.array(config.controlledRoomIds, 'config.controlledRoomIds is not an array');

  const mqttClient = new MqttClient({
    url: config.mqttBroker,
    logger,
  });

  const thisRooms = config.rooms.filter(room => config.controlledRoomIds.includes(room.id));

  const roomMap = {};
  const initialRoomStatus = {};

  const handleMqttMessage = async(topic, data) => {
    // logger.debug('handleMqttMessage', topic, data);

    const [
      area,
      areaId,
      element,
      elementId,
      subArea,
    ] = topic.split('/');

    if(area === 'room' && element === 'shutters' && subArea === 'status') {
      initialRoomStatus[areaId] = initialRoomStatus[areaId] || {};
      initialRoomStatus[areaId][elementId] = data.value;
    } else if(area === 'room' && element === 'shutters' && ['up', 'down', 'stop'].includes(subArea)) {
      if(roomMap[areaId]) {
        roomMap[areaId][subArea](elementId);
      }
    // } else if(area === 'room' && element === 'shutters' && subArea === 'moveTo') {
    //   if(roomMap[areaId]) {
    //     roomMap[areaId].moveTo(elementId, data.value);
    //   }
    } else if(area === 'room' && element === 'buttons' && subArea === 'active') {
      if(roomMap[areaId]) {
        roomMap[areaId].buttonActive(elementId, data.value);
      }
    }
  }

  await mqttClient.init(handleMqttMessage);

  for(const room of thisRooms) {
    for(const shutter of room.shutters || []) {
      await mqttClient.subscribe(shutterUp(room.id, shutter.id));
      await mqttClient.subscribe(shutterDown(room.id, shutter.id));
      await mqttClient.subscribe(shutterStop(room.id, shutter.id));
      await mqttClient.subscribe(shutterStatus(room.id, shutter.id));
      await mqttClient.subscribe(shutterToggle(room.id, shutter.id));
      await mqttClient.subscribe(buttonActive(room.id, shutter.id));
      await mqttClient.subscribe(shutterInit(room.id, shutter.id));
      // await mqttClient.subscribe(shutterMoveTo(room.id, shutter.id));
    }

    for(const window of room.windows || []) {
      await mqttClient.subscribe(windowStatus(room.id, window.id));
    }
  }

  for(const room of thisRooms) {
    roomMap[room.id] = new RoomControl({
      logger,
      room,
      mqttClient,
      status: initialRoomStatus[room.id],
    });
  }
 })();
