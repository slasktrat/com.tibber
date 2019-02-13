'use strict';

const   Homey               = require('homey'),
        _                   = require('lodash'),
        moment              = require('moment-timezone'),
        http                = require('http.min'),
        tibber              = require('../../lib/tibber');

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
        tibber.subscribeToLive(this.getData().t, this._deviceId, async result => {
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

            let cost = _.get(result, 'data.liveMeasurement.accumulatedCost');
            if(!cost) {
                try {
                    const now = moment();
                    if(!this._cachedNordpoolPrice || this._cachedNordpoolPrice.hour !== now.hour()) {
                        const area = this._area || 'Oslo';
                        const currency = this._currency || 'NOK';
                        this.log(`Using nordpool prices. Currency: ${currency} - Area: ${area}`);
                        const result = await http.json(`https://www.nordpoolgroup.com/api/marketdata/page/10?currency=${currency},${currency},${currency},${currency}&endDate=${moment().format("DD-MM-YYYY")}`);
                        const areaCurrentPrice = _(_.get(result, 'data.Rows'))
                                                .filter(row => !row.IsExtraRow && moment.tz(row.StartTime, 'Europe/Oslo').isBefore(now) && moment.tz(row.EndTime, 'Europe/Oslo').isAfter(now))
                                                .map(row => row.Columns)
                                                .first()
                                                .find(a => a.Name === area);

                        if(areaCurrentPrice) {
                            let currentPrice = Number(areaCurrentPrice.Value.replace(',', '.').trim()) / 1000;
                            this._cachedNordpoolPrice = { hour: now.hour(), price: currentPrice };
                        }
                    }
                    if(_.isNumber(this._cachedNordpoolPrice.price))
                        cost = this._cachedNordpoolPrice.price * consumption;
                }
                catch (e) {
                    console.error('Error fetching prices from nordpool', e);
                }
            }

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
        if (changedKeysArr.includes('pulse_currency')) {
            this.log('Updated currency value: ', newSettingsObj.pulse_currency);
            this._currency = newSettingsObj.pulse_currency;
            this._cachedNordpoolPrice = null;
        }
        if (changedKeysArr.includes('pulse_area')) {
            this.log('Updated area value: ', newSettingsObj.pulse_area);
            this._area = newSettingsObj.pulse_area;
            this._cachedNordpoolPrice = null;
        }
        callback(null, true);
    }
}

module.exports = MyDevice;