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
        if(_.get(priceInfo, 'startsAt') !== _.get(this._lastPrice, 'startsAt')) {
        	this._lastPrice = priceInfo;
            this._priceChangedTrigger.trigger(this, priceInfo);
            this.log('Triggering price_changed', priceInfo);

            if(priceInfo.total !== null) {
                let priceLogger = await this._createGetLog(this._insightId + 'price', {
                    label: `${this._deviceLabel} price`,
                    type: 'number',
                    decimals: true
                });
                priceLogger.createEntry(priceInfo.total, moment(priceInfo.startsAt).toDate());
            }
		}

		const consumption = _.get(data, 'consumption.nodes[0]');
        if(_.get(consumption, 'from') !== _.get(this._lastConsumptionReport, 'from')) {
            this._lastConsumptionReport = consumption;
            this._consumptionReportTrigger.trigger(this, consumption);
            this.log('Triggering consumption_report', consumption);

            if(consumption.consumption !== null) {
                let consumptionLogger = await this._createGetLog(this._insightId + 'consumption', {
                    label: `${this._deviceLabel} consumption`,
                    type: 'number',
                    decimals: true
                });
                consumptionLogger.createEntry(consumption.consumption, moment(consumption.to).toDate());
            }

            if(consumption.totalCost !== null) {
                let costLogger = await this._createGetLog(this._insightId + 'cost', {
                    label: `${this._deviceLabel} cost`,
                    type: 'number',
                    decimals: true
                });
                costLogger.createEntry(consumption.totalCost, moment(consumption.to).toDate());
            }
        }
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