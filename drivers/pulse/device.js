'use strict';

const   Homey               = require('homey'),
        _                   = require('lodash'),
        moment              = require('moment'),
        tibber              = require('../../tibber');

class MyDevice extends Homey.Device {
	
	onInit() {
        this._deviceId = this.getData().id;
        this._throttle = this.getSetting('pulse_throttle') || 30;

        this._powerChangedTrigger = new Homey.FlowCardTriggerDevice('power_changed');
        this._powerChangedTrigger.register();

        this._consumptionChangedTrigger = new Homey.FlowCardTriggerDevice('consumption_changed');
        this._consumptionChangedTrigger.register();

        this._costChangedTrigger = new Homey.FlowCardTriggerDevice('cost_changed');
        this._costChangedTrigger.register();

        this._dailyConsumptionReportTrigger = new Homey.FlowCardTriggerDevice('daily_consumption_report');
        this._dailyConsumptionReportTrigger.register();

        this.log(`Tibber pulse device ${this.getName()} has been initialized (throttle: ${this._throttle})`);

        let prevPower, prevConsumption, prevCost, prevUpdate;
        tibber.subscribeToLive(this.getData().t, this._deviceId, result => {
            if(prevUpdate && moment().diff(prevUpdate, 'seconds') < this._throttle)
                return;

            prevUpdate = moment();
            const power = _.get(result, 'data.liveMeasurement.power');
            if(power) {
                if(power !== prevPower) {
                    prevPower = power;
                    this.setCapabilityValue("measure_power", power).catch(console.error);
                    this._powerChangedTrigger.trigger(this, { power: power }).catch(console.error);
                }
            }

            const consumption = _.get(result, 'data.liveMeasurement.accumulatedConsumption');
            if(consumption && _.isNumber(consumption)) {
                const fixedConsumtion = +consumption.toFixed(2);
                if(fixedConsumtion !== prevConsumption) {
                    if(fixedConsumtion < prevConsumption) //Consumption has been reset
                    {
                        this.log('Triggering daily consumption report');
                        this._dailyConsumptionReportTrigger.trigger(this, {consumption: prevConsumption, cost: prevCost}).catch(console.error)
                    }

                    prevConsumption = fixedConsumtion;
                    this.setCapabilityValue("meter_power", fixedConsumtion).catch(console.error);
                    this._consumptionChangedTrigger.trigger(this, { consumption: fixedConsumtion }).catch(console.error);
                }
            }

            const cost = _.get(result, 'data.liveMeasurement.accumulatedCost');
            if(cost && _.isNumber(cost)) {
                const fixedCost = +cost.toFixed(2);
                if(fixedCost !== prevCost) {
                    prevCost = fixedCost;
                    this.setCapabilityValue("accumulatedCost", fixedCost).catch(console.error);
                    this._costChangedTrigger.trigger(this, { cost: fixedCost}).catch(console.error);
                }
            }
        });
    }

    onSettings(oldSettingsObj, newSettingsObj, changedKeysArr, callback) {
        if (changedKeysArr.includes('pulse_throttle')) {
            this.log('Updated throttle value: ', newSettingsObj.pulse_throttle);
            this._throttle = newSettingsObj.pulse_throttle;
        }
        callback(null, true);
    }
}

module.exports = MyDevice;