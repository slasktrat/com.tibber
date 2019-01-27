'use strict';

const   Homey               = require('homey'),
        _                   = require('lodash'),
        moment				= require('moment'),
        Promise             = require('bluebird'),
        tibber              = require('../../tibber');

const yrno = require('yr.no-forecast')({
    version: '1.9',
    request: { timeout: 15000 }
});

class MyDevice extends Homey.Device {
	
	onInit() {

        if(!this.getData().address)
            return this.setUnavailable("You will need to remove and add this home as new device");

        this._deviceId = this.getData().id;
        this._deviceLabel = this.getName();
        this._insightId = this._deviceLabel.replace(/[^a-z0-9]/ig,'_').toLowerCase();
        this._lastPrice = undefined;
        this._lastTemperature = undefined;
        this._lastFetchedStartAt = undefined;
        this._location = { lat:this.getData().address.latitude, lon:this.getData().address.longitude };

        this._priceChangedTrigger = new Homey.FlowCardTriggerDevice('price_changed');
        this._priceChangedTrigger.register();

        this._temperatureChangedTrigger = new Homey.FlowCardTriggerDevice('temperature_changed');
        this._temperatureChangedTrigger.register();

        this._consumptionReportTrigger = new Homey.FlowCardTriggerDevice('consumption_report');
        this._consumptionReportTrigger.register();

        this._priceBelowAvgTrigger = new Homey.FlowCardTriggerDevice('price_below_avg');
        this._priceBelowAvgTrigger
            .register()
            .registerRunListener(this._priceAvgComparer.bind(this));

        this._priceAboveAvgTrigger = new Homey.FlowCardTriggerDevice('price_above_avg');
        this._priceAboveAvgTrigger
            .register()
            .registerRunListener(this._priceAvgComparer.bind(this));

        this._priceAtLowestTrigger = new Homey.FlowCardTriggerDevice('price_at_lowest');
        this._priceAtLowestTrigger
            .register()
            .registerRunListener(this._priceMinMaxComparer.bind(this));

        this._priceAtHighestTrigger = new Homey.FlowCardTriggerDevice('price_at_highest');
        this._priceAtHighestTrigger
            .register()
            .registerRunListener(this._priceMinMaxComparer.bind(this));

        this._currentPriceBelowCondition = new Homey.FlowCardCondition('current_price_below');
        this._currentPriceBelowCondition
            .register()
            .registerRunListener(args => args.price > _.get(this._lastPrice, 'total'));

        this._outdoorTemperatureBelowCondition = new Homey.FlowCardCondition('temperature_below');
        this._outdoorTemperatureBelowCondition
            .register()
            .registerRunListener(args => args.temperature > this._lastTemperature);

        this._sendPushNotificationAction = new Homey.FlowCardAction('sendPushNotification');
        this._sendPushNotificationAction
            .register()
            .registerRunListener(args => tibber.sendPush(this.getData().t, args.title, args.message));

        this.log(`Tibber home device ${this.getName()} has been initialized`);
        return this.fetchData();
	}

	onDeleted() {
	    this.log('Device deleted:', this._deviceLabel);

        Homey.ManagerSettings.set(`${this._insightId}_lastLoggedDailyConsumption`, undefined);
        Homey.ManagerSettings.set(`${this._insightId}_lastLoggerHourlyConsumption`, undefined);

        return Homey.app.cleanupLogs(this._insightId);
    }

	async getTemperature() {
	    try {
	        const weather = await yrno.getWeather(this._location);
            let json = weather.getJson();
            let temperature = Number(_.get(json, 'weatherdata.product.time["0"].location.temperature.value'));
            if(temperature && temperature !== this._lastTemperature)
            {
                this._lastTemperature = temperature;
                this.setCapabilityValue('measure_temperature', temperature).catch(console.error);

                this.log('Triggering temperature_changed', temperature);
                this._temperatureChangedTrigger.trigger(this, temperature);

                const loggerPrefix = this.getDriver().getDevices().length > 1 ? (`${this._deviceLabel} `) : '';
                let temperatureLogger = await this._createGetLog(`${this._insightId}_temperature`, {
                    label: `${loggerPrefix}Outdoor temperature`,
                    type: 'number',
                    decimals: true
                });
                temperatureLogger.createEntry(temperature, moment(json.weatherdata.product.time["0"].from).toDate()).catch(console.error);
            }
        }
        catch (e) {
            console.error('Error fetching weather forecast', e);
        }
    }

    async fetchData() {
        try {
            this.log(`Fetching data...`);
            let data = await tibber.getData(this.getData().t, this._deviceId);
            let startAt = _.get(data, 'viewer.home.currentSubscription.priceInfo.current.startsAt');
            if(startAt) {
                let startAtDate = moment(startAt);
                if(startAtDate.valueOf() === this._lastFetchedStartAt)
                {
                    this.log('Price startAt unchanged, trying again in 30 seconds');
                    return this.scheduleFetchData(30);
                }

                this._lastFetchedStartAt = startAtDate.valueOf();
                let next = startAtDate.add(1, 'hour').add(10, 'seconds');
                this.scheduleFetchData(next.diff(moment(), 'seconds'));
            }
            else //Unable to schedule next fetch based on timestamp, fetching again in one hour
                this.scheduleFetchData(60 * 60);

            return Promise.all([this.onData(data), this.getTemperature()]);
        }
        catch(e) {
            this.log('Error fetching data', e);
            //Try again in two minutes
            this.scheduleFetchData(120);
        }
    }

    scheduleFetchData(seconds) {
	    this.log(`Fetching data in ${seconds} seconds`);
        setTimeout(this.fetchData.bind(this), seconds * 1000);
    }

    async onData(data) {
        const priceInfoCurrent = _.get(data, 'viewer.home.currentSubscription.priceInfo.current');
        const loggerPrefix = this.getDriver().getDevices().length > 1 ? (`${this._deviceLabel} `) : '';

        if(_.get(priceInfoCurrent, 'startsAt') !== _.get(this._lastPrice, 'startsAt')) {
        	this._lastPrice = priceInfoCurrent;

            if(priceInfoCurrent.total !== null) {
                this.setCapabilityValue("price_total", priceInfoCurrent.total).catch(console.error);

                this._priceChangedTrigger.trigger(this, priceInfoCurrent);
                this.log('Triggering price_changed', priceInfoCurrent);

                let priceLogger = await this._createGetLog(`${this._insightId}_price`, {
                    label: `${loggerPrefix}Current price`,
                    type: 'number',
                    decimals: true
                });
                priceLogger.createEntry(priceInfoCurrent.total, moment(priceInfoCurrent.startsAt).toDate()).catch(console.error);

                const priceInfoToday = _.get(data, 'viewer.home.currentSubscription.priceInfo.today');
                const priceInfoTomorrow = _.get(data, 'viewer.home.currentSubscription.priceInfo.tomorrow');
                let priceInfoNextHours;
                if(priceInfoToday && priceInfoTomorrow)
                    priceInfoNextHours = priceInfoToday.concat(priceInfoTomorrow);
                else if (priceInfoToday)
                    priceInfoNextHours = priceInfoToday;

                if(priceInfoNextHours) {
                    this._priceBelowAvgTrigger.trigger(this, null, {
                        below: true,
                        priceInfoCurrent: priceInfoCurrent,
                        priceInfoNextHours: priceInfoNextHours
                    }).catch(console.error);

                    this._priceAboveAvgTrigger.trigger(this, null, {
                        below: false,
                        priceInfoCurrent: priceInfoCurrent,
                        priceInfoNextHours: priceInfoNextHours
                    }).catch(console.error);

                    this._priceAtLowestTrigger.trigger(this, null, {
                        lowest: true,
                        priceInfoCurrent: priceInfoCurrent,
                        priceInfoNextHours: priceInfoNextHours
                    }).catch(console.error);

                    this._priceAtHighestTrigger.trigger(this, null, {
                        lowest: false,
                        priceInfoCurrent: priceInfoCurrent,
                        priceInfoNextHours: priceInfoNextHours
                    }).catch(console.error);
                }
            }
		}

		try {
            const lastLoggedDailyConsumption = Homey.ManagerSettings.get(`${this._insightId}_lastLoggedDailyConsumption`);
            const consumptionsSinceLastReport = [];
            const dailyConsumptions = _.get(data, 'viewer.home.daily.nodes') || [];
            await Promise.mapSeries(dailyConsumptions, async dailyConsumption => {
                if (dailyConsumption.consumption !== null) {
                    if (lastLoggedDailyConsumption && moment(dailyConsumption.to) <= moment(lastLoggedDailyConsumption))
                        return;

                    consumptionsSinceLastReport.push(dailyConsumption);
                    Homey.ManagerSettings.set(`${this._insightId}_lastLoggedDailyConsumption`, dailyConsumption.to);

                    this.log('Got daily consumption', dailyConsumption);
                    let consumptionLogger = await this._createGetLog(`${this._insightId}_dailyConsumption`, {
                        label: `${loggerPrefix}Daily consumption`,
                        type: 'number',
                        decimals: true
                    });

                    consumptionLogger.createEntry(dailyConsumption.consumption, moment(dailyConsumption.to).toDate()).catch(console.error);

                    let costLogger = await this._createGetLog(`${this._insightId}_dailyCost`, {
                        label: `${loggerPrefix}Daily total cost`,
                        type: 'number',
                        decimals: true
                    });
                    costLogger.createEntry(dailyConsumption.totalCost, moment(dailyConsumption.to).toDate()).catch(console.error);
                }
            });

            if (consumptionsSinceLastReport.length > 0)
                this._consumptionReportTrigger.trigger(this, {
                    consumption: +_.sumBy(consumptionsSinceLastReport, 'consumption').toFixed(2),
                    totalCost: +_.sumBy(consumptionsSinceLastReport, 'totalCost').toFixed(2),
                    unitCost: +_.sumBy(consumptionsSinceLastReport, 'unitCost').toFixed(2),
                    unitPrice: +_.meanBy(consumptionsSinceLastReport, 'unitPrice').toFixed(2)
                });
        }
        catch (e) {
		    console.error('Error logging daily consumption', e);
        }

        try {
            const lastLoggedHourlyConsumption = Homey.ManagerSettings.get(`${this._insightId}_lastLoggerHourlyConsumption`);
            const hourlyConsumptions = _.get(data, 'viewer.home.hourly.nodes') || [];
            await Promise.mapSeries(hourlyConsumptions, async hourlyConsumption => {
                if (hourlyConsumption.consumption !== null) {
                    if (lastLoggedHourlyConsumption && moment(hourlyConsumption.to) <= moment(lastLoggedHourlyConsumption))
                        return;

                    Homey.ManagerSettings.set(`${this._insightId}_lastLoggerHourlyConsumption`, hourlyConsumption.to);

                    this.log('Got hourly consumption', hourlyConsumption);
                    let consumptionLogger = await this._createGetLog(`${this._insightId}hourlyConsumption`, {
                        label: `${loggerPrefix}Hourly consumption`,
                        type: 'number',
                        decimals: true
                    });

                    consumptionLogger.createEntry(hourlyConsumption.consumption, moment(hourlyConsumption.to).toDate()).catch(console.error);

                    let costLogger = await this._createGetLog(`${this._insightId}_hourlyCost`, {
                        label: `${loggerPrefix}Hourly total cost`,
                        type: 'number',
                        decimals: true
                    });
                    costLogger.createEntry(hourlyConsumption.totalCost, moment(hourlyConsumption.to).toDate()).catch(console.error);
                }
            });
        }
        catch (e) {
            console.error('Error logging hourly consumption', e);
        }
    }

    _priceAvgComparer(args, state) {
        if (!args.hours)
            return false;

        const now = moment();
        let avgPriceNextHours = _(state.priceInfoNextHours)
                                    .filter(p => args.hours > 0 ? moment(p.startsAt).isAfter(now) : moment(p.startsAt).isBefore(now))
                                    .take(Math.abs(args.hours))
                                    .meanBy(x => x.total);

        let diffAvgCurrent = (state.priceInfoCurrent.total - avgPriceNextHours) / avgPriceNextHours * 100;
        if (state.below)
            diffAvgCurrent = diffAvgCurrent * -1;

        this.log(`${state.priceInfoCurrent.total.toFixed(2)} is ${diffAvgCurrent.toFixed(2)}% ${args.below ? 'below' : 'above'} avg (${avgPriceNextHours.toFixed(2)}) next ${args.hours} hours. Condition of min ${args.percentage} percentage met = ${diffAvgCurrent > args.percentage}`);
        return diffAvgCurrent > args.percentage;
    }

    _priceMinMaxComparer(args, state) {
        if (!args.hours)
            return false;

        const now = moment();
        let pricesNextHours = _(state.priceInfoNextHours)
            .filter(p => args.hours > 0 ? moment(p.startsAt).isAfter(now) : moment(p.startsAt).isBefore(now))
            .take(Math.abs(args.hours))
            .value();

        const toCompare = state.lowest ? _.minBy(pricesNextHours, 'total').total
            : _.maxBy(pricesNextHours, 'total').total;

        const conditionMet = state.lowest ? state.priceInfoCurrent.total <= toCompare
            : state.priceInfoCurrent.total >= toCompare;

        this.log(`${state.priceInfoCurrent.total.toFixed(2)} is ${state.lowest ? 'lower than the lowest' : 'higher than the highest'} (${toCompare}) among the next ${args.hours} hours = ${conditionMet}`);
        return conditionMet;
    }

    async _createGetLog(name, options) {
	    try {
	        let log = await Homey.ManagerInsights.getLog(name);
	        return log;
        }
        catch(e) {
            console.error('Could not find log ' + name + '. Creating new log.', e);
	        if(!options.title)
	            options.title = options.label; //for 2.0 support

             return Homey.ManagerInsights.createLog(name, options);
        }
    }
}

module.exports = MyDevice;