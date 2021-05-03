'use strict';

const check = require('check-types-2');

const {
  controls,
  topics,
} = require('@joachimhb/smart-home-shared');

const {
  shutterMovement,
  shutterStatus,
  // windowOpenStatus,
} = topics;

const {Shutter} = controls;

class RoomControl {
  constructor(params) {
    check.assert.object(params, 'params is not an object');
    check.assert.object(params.logger, 'params.logger is not an object');
    check.assert.object(params.mqttClient, 'params.mqttClient is not an object');
    check.assert.object(params.room, 'params.room is not an object');

    Object.assign(this, params);

    const {room, logger, mqttClient} = this;

    this.shutterMap = {};

    for(const shutter of room.shutters || []) {
      this.shutterMap[shutter.id] = new Shutter({
        logger,
        location: `${room.label}/${shutter.label}`,
        ...shutter,
        onStatusUpdate: async value => {
          await mqttClient.publish(shutterStatus(room.id, shutter.id), {value}, {retain: true});
        },
        onStop: async() => {
          await mqttClient.publish(shutterMovement(room.id, shutter.id), {value: 'stop'}, {retain: true});
        },
      });
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
}

module.exports = RoomControl;
