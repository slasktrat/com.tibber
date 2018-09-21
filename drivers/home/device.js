'use strict';

const   Homey               = require('homey'),
        _                   = require('lodash'),
		moment				= require('moment');

class MyDevice extends Homey.Device {
	
	onInit() {
        this._deviceLabel = this.getData().id;
        this._insightId = this._deviceLabel.replace(/[^a-z0-9]/g,'');
        this._lastPrice = undefined;
        this._lastConsumptionReport = undefined;

        this._priceChangedTrigger = new Homey.FlowCardTriggerDevice('price_changed');
        this._priceChangedTrigger.register();

        this._consumptionReportTrigger = new Homey.FlowCardTriggerDevice('consumption_report');
        this._consumptionReportTrigger.register();

        this._currentPriceBelowCondition = new Homey.FlowCardCondition('current_price_below');
        this._currentPriceBelowCondition
            .register()
            .registerRunListener(args => args.price > _.get(this._lastPrice, 'total'));

        this.log(`Tibber device ${this.getName()} has been initialized`);
	}

    async onData(data) {
        const priceInfo = _.get(data, 'currentSubscription.priceInfo.current');
        const loggerPrefix = this.getDriver().getDevices().length > 1 ? (`${this._deviceLabel} `) : '';

        if(_.get(priceInfo, 'startsAt') !== _.get(this._lastPrice, 'startsAt')) {
        	this._lastPrice = priceInfo;
            this._priceChangedTrigger.trigger(this, priceInfo);
            this.log('Triggering price_changed', priceInfo);

            if(priceInfo.total !== null) {
                this.setCapabilityValue("price_total", priceInfo.total).catch(this.error);
                let priceLogger = await this._createGetLog(this._insightId + 'price', {
                    label: `${loggerPrefix}Current price`,
                    type: 'number',
                    decimals: true
                });
                priceLogger.createEntry(priceInfo.total, moment(priceInfo.startsAt).toDate()).catch();
            }
		}

		const dailyConsumption = _.get(data, 'daily.nodes[0]');
        if(_.get(dailyConsumption, 'from') !== _.get(this._lastConsumptionReport, 'from')) {
            this._lastConsumptionReport = dailyConsumption;
            this._consumptionReportTrigger.trigger(this, dailyConsumption);
            this.log('Triggering consumption_report', dailyConsumption);

            if(dailyConsumption.consumption !== null) {
                this.setCapabilityValue("meter_power", dailyConsumption.consumption).catch(this.error);
                let consumptionLogger = await this._createGetLog(this._insightId + 'dailyConsumption', {
                    label: `${loggerPrefix}Daily consumption`,
                    type: 'number',
                    decimals: true
                });
                consumptionLogger.createEntry(dailyConsumption.consumption, moment(dailyConsumption.to).toDate()).catch();
            }

            if(dailyConsumption.totalCost !== null) {
                // this.setCapabilityValue("cost_yesterday", dailyConsumption.totalCost).catch(this.error);

                let costLogger = await this._createGetLog(this._insightId + 'cost', {
                    label: `${loggerPrefix}Daily total cost`,
                    type: 'number',
                    decimals: true
                });
                costLogger.createEntry(dailyConsumption.totalCost, moment(dailyConsumption.to).toDate()).catch();
            }
        }

        const lastLoggedHourlyConsumption = Homey.ManagerSettings.get('lastLoggerHourlyConsumption');
        const hourlyConsumptions = _.get(data, 'hourly.nodes');
        _.each(hourlyConsumptions, async hourlyConsumption => {
            if(hourlyConsumption.consumption !== null ) {
                if(lastLoggedHourlyConsumption && moment(hourlyConsumption.to) <= moment(lastLoggedHourlyConsumption))
                    return;

                Homey.ManagerSettings.set('lastLoggerHourlyConsumption', hourlyConsumption.to);

                this.log('Got hourly consumption', hourlyConsumption);
                let consumptionLogger = await this._createGetLog(this._insightId + 'hourlyConsumption', {
                    label: `${loggerPrefix}Hourly consumption`,
                    type: 'number',
                    decimals: true
                });

                consumptionLogger.createEntry(hourlyConsumption.consumption, moment(hourlyConsumption.to).toDate()).catch();

                let costLogger = await this._createGetLog(this._insightId + 'cost', {
                    label: `${loggerPrefix}Hourly total cost`,
                    type: 'number',
                    decimals: true
                });
                costLogger.createEntry(hourlyConsumption.totalCost, moment(hourlyConsumption.to).toDate()).catch();
            }
        });
    }

    async _createGetLog(name, options) {
	    try {
	        let log = await Homey.ManagerInsights.getLog(name);
	        return log;
        }
        catch(e) {
	        return Homey.ManagerInsights.createLog(name, options);
        }
    }
}

module.exports = MyDevice;