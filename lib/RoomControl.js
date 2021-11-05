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
  Button,
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
    this.buttonMap = {};
    this.windowMap = {};
    this.windowAffectsShutterMap = {};
    this.buttonAffectsShutterMap = {};

    for(const shutter of room.shutters || []) {
      const status = _.get(params, ['status', shutter.id], 0);
      
      for(const id of shutter.triggerButtons || []) {
        this.buttonAffectsShutterMap[id] = shutter.id;
      }

      for(const id of shutter.triggerWindows || []) {
        this.windowAffectsShutterMap[id] = shutter.id;
      }

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
    }

    for(const window of room.windows || []) {
      this.windowAffectsShutterMap[window.id] = window.affectsShutter;

      if(window.gpio) {
        this.windowMap[window.id] = new Circuit({
          logger,
          location: `${room.label}/${window.label}`,
          interval: 1000,
          default: 'closed',
          gpio: window.gpio,
          onChange: async value => {
            await mqttClient.publish(windowStatus(room.id, window.id), {value}, {retain: true});

            const shutterId = this.windowAffectsShutterMap[window.id];

            if(shutterId && this.shutterMap[shutterId]) {
              if(value === 'closed') {
                this.shutterMap[shutterId].setMax(100);
              } else if(value === 'open') {
                this.shutterMap[shutterId].setMax(80);
              }
            }
          }
        });

        this.windowMap[window.id].start();
      }
    }

    for(const button of room.buttons || []) {
      const active = _.get(params, ['button', button.id], true);

      this.buttonMap[button.id] = new Button({
        logger,
        location: `${room.label}/${button.label}`,
        interval: 150,
        gpio: button.gpio,
        onClosed: async () => {
          const shutterId = this.buttonAffectsShutterMap[button.id];

          if(shutterId && this.shutterMap[shutterId]) {
            this.shutterMap[shutterId].toggle();
          }
        }
      });

      if(active) {
        this.buttonMap[button.id].start();
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
