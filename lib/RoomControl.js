'use strict';

const _ = require('lodash');

const check = require('check-types-2');

const {
  sensors,
  controls,
  topics,
} = require('@joachimhb/smart-home-shared');

const {
  shutterMovement,
  shutterStatus,
  shutterToggle,
  windowStatus,
} = topics;

const {
  Shutter,
} = controls;

const {
  Circuit,
} = sensors;

class RoomControl {
  constructor(params) {
    check.assert.object(params, 'params is not an object');
    check.assert.object(params.logger, 'params.logger is not an object');
    check.assert.object(params.mqttClient, 'params.mqttClient is not an object');
    check.assert.object(params.room, 'params.room is not an object');
    check.assert.maybe.object(params.status, 'params.status is not an object');

    Object.assign(this, params);

    const {room, logger, mqttClient} = this;

    this.shutterMap = {};
    this.switchMap = {};
    this.windowMap = {};
    this.windowAffectsShutterMap = {};

    for(const shutter of room.shutters || []) {
      const status = _.get(params, ['status', shutter.id], 0);

      this.shutterMap[shutter.id] = new Shutter({
        logger,
        location: `${room.label}/${shutter.label}`,
        ...shutter,
        status,
        onStatusUpdate: async value => {
          await mqttClient.publish(shutterStatus(room.id, shutter.id), {value}, {retain: true});
        },
        onStop: async() => {
          await mqttClient.publish(shutterMovement(room.id, shutter.id), {value: 'stop'}, {retain: true});
        },
      });

      
      if(shutter.switchGpio) {
        this.switchMap[shutter.id] = new Circuit({
          logger,
          location: `${room.label}/${shutter.label}/Switch`,
          interval: 50,
          default: 'open',
          gpio: shutter.switchGpio,
          onChange: async value => {
            if(value === 'closed') {
              await mqttClient.publish(shutterToggle(room.id, shutter.id), {}, {retain: false});
            }
          }
        });
      }
    }

    for(const window of room.windows || []) {
      this.windowAffectsShutterMap[window.id] = window.affectsShutter;

      if(window.gpio) {
        this.windowMap[window.id] = new Circuit({
          logger,
          location: `${room.label}/${window.label}/Switch`,
          interval: 1000,
          default: 'closed',
          gpio: window.gpio,
          onChange: async value => {
            await mqttClient.publish(windowStatus(room.id, window.id), {value}, {retain: false});
          }
        });
      }
    }
  }

  up(id) {
    return this.shutterMap[id] && this.shutterMap[id].up();
  }

  stop(id) {
    return this.shutterMap[id] && this.shutterMap[id].stop();
  }

  down(id) {
    return this.shutterMap[id] && this.shutterMap[id].down();
  }
  
  toggle(id) {
    return this.shutterMap[id] && this.shutterMap[id].toggle();
  }

  windowOpen(id) {
    const shutterId = this.windowAffectsShutterMap[id];

    if(shutterId) {
      return this.shutterMap[id] && this.shutterMap[id].setMax(80);
    }
  } 

  windowClosed(id) {
    const shutterId = this.windowAffectsShutterMap[id];

    if(shutterId) {
      return this.shutterMap[id] && this.shutterMap[id].setMax(100);
    }
  } 
}

module.exports = RoomControl;
