'use strict';

const _     = require('lodash');
const check = require('check-types-2');

const {
  controls,
  topics,
} = require('@jhb/smart-home-shared');

const {
  shutterMovement,
  shutterStatus,
  // windowOpenStatus,
} = topics;

const {Shutter} = controls;

class ShutterControl {
  constructor(params) {
    check.assert.object(params, 'params is not an object');
    check.assert.object(params.logger, 'params.logger is not an object');
    check.assert.object(params.config, 'params.config is not an object');

    Object.assign(this, params);

    this.controls = {};

    for(const shutter of this.config.shutters || []) {
      this.controls[shutter.room.id] = this.controls[shutter.room.id] || {};

      this.controls[shutter.room.id][shutter.id] = new Shutter({
        logger: this.logger,
        location: `${shutter.room.label}/${shutter.label}`,
        ...shutter,
        onStatusUpdate: async value => {
          await this.mqttClient.publish(shutterStatus(shutter.room.id, shutter.id), {value}, {retain: true});
        },
        onStop: async() => {
          await this.mqttClient.publish(shutterMovement(shutter.room.id, shutter.id), {value: 'stop'}, {retain: true});
        },
      });
    }
  }

  getShutterControl(roomId, shutterId) {
    return _.get(this.controls, [roomId, shutterId]);
  }

  async up(roomId, shutterId) {
    const ctrl = this.getShutterControl(roomId, shutterId);

    if(!ctrl) {
      return this.logger.warn(`up - ${roomId}/${shutterId} not found`);
    }

    return ctrl.up();
  }

  stop(roomId, shutterId) {
    const ctrl = this.getShutterControl(roomId, shutterId);

    if(!ctrl) {
      return this.logger.warn(`stop - ${roomId}/${shutterId} not found`);
    }

    return ctrl.stop();
  }

  async down(roomId, shutterId) {
    const ctrl = this.getShutterControl(roomId, shutterId);

    if(!ctrl) {
      return this.logger.warn(`down - ${roomId}/${shutterId} not found`);
    }

    return ctrl.down();
  }
}

module.exports = ShutterControl;
