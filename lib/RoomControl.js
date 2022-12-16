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
  shutterInit,
  windowStatus,
} = topics;

const {
  Shutter,
  Button,
} = controls;

const {
  IntervalCircuit,
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

    this.shutterConfigById = {};

    this.shutterMap = {};
    this.buttonMap = {};
    this.windowMap = {};
    this.buttonAffectsShutterMap = {};

    for(const shutter of room.shutters || []) {
      const {id, label, triggerButtons} = shutter;
      
      this.shutterConfigById[id] = shutter;

      const status = _.get(params, ['status', id], 0);
      
      for(const buttonId of triggerButtons || []) {
        this.buttonAffectsShutterMap[buttonId] = id;
      }

      this.shutterMap[shutter.id] = new Shutter({
        logger,
        location: `${room.label}/${label}`,
        ...shutter,
        status,
        onStatusUpdate: async value => {
          await mqttClient.publish(shutterStatus(room.id, id), {value}, {retain: true});
        },
        onMovementUpdate: async value => {
          await mqttClient.publish(shutterMovement(room.id, id), {value}, {retain: true});
        },
      });

      mqttClient.publish(shutterInit(room.id, id), {}, {retain: true});
    }

    for(const window of room.windows || []) {
      const {id, label, gpio, shutterId, interval} = window;

      if(gpio) {
        this.windowMap[id] = new IntervalCircuit({
          logger,
          location: `${room.label}/${label}`,
          default: 'closed',
          gpio: gpio,
          interval,
          onChange: async value => {
            await mqttClient.publish(windowStatus(room.id, id), {value}, {retain: true});
            
            if(shutterId && this.shutterMap[shutterId]) {
              if(value === 'closed') {
                this.shutterMap[shutterId].setMax(100);
              } else if(value === 'open') {
                this.shutterMap[shutterId].setMax(80);
              }
            }
          }
        });

        this.windowMap[id].start();
      }
    }

    for(const button of room.buttons || []) {
      const {id, label, gpio, action = 'toggle', interval} = button;
      
      const active = _.get(params, ['button', id], true);

      this.buttonMap[id] = new Button({
        logger,
        location: `${room.label}/${label}`,
        gpio,
        interval,
        onClose: async () => {
          const shutterId = this.buttonAffectsShutterMap[id];

          if(shutterId && this.shutterMap[shutterId]) {
            this.shutterMap[shutterId][action]();
          }
        }
      });

      if(active) {
        this.buttonMap[id].start();
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

  // moveTo(id, value) {
  //   return this.shutterMap[id] && this.shutterMap[id].moveTo(value);
  // }
  
  buttonActive(id, value) {
    if(this.buttonMap[id]) {
      if(value) {
        this.buttonMap[id].start();
      } else {
        this.buttonMap[id].stop();
      }
    }
  }
}

module.exports = RoomControl;
