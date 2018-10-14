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
        this._deviceId = this.getData().id;
        this._deviceLabel = this.getName();
        this._insightId = this._deviceLabel.replace(/[^a-z0-9]/ig,'_');
        this._lastPrice = undefined;
        this._lastTemperature = undefined;
        this._lastFetchedStartAt = undefined;
        this._location = { lat:this.getData().address.latitude, lon:this.getData().address.longitude };

        if(!this.getData().address)
            return this.setUnavailable("You will need to remove and add this home as new device");

        this._priceChangedTrigger = new Homey.FlowCardTriggerDevice('price_changed');
        this._priceChangedTrigger.register();

        this._temperatureChangedTrigger = new Homey.FlowCardTriggerDevice('temperature_changed');
        this._temperatureChangedTrigger.register();

        this._consumptionReportTrigger = new Homey.FlowCardTriggerDevice('consumption_report');
        this._consumptionReportTrigger.register();

        this._currentPriceBelowCondition = new Homey.FlowCardCondition('current_price_below');
        this._currentPriceBelowCondition
            .register()
            .registerRunListener(args => args.price > _.get(this._lastPrice, 'total'));

        this._sendPushNotificationAction = new Homey.FlowCardAction('sendPushNotification');
        this._sendPushNotificationAction
            .register()
            .registerRunListener(args => tibber.sendPush(this.getData().t, args.title, args.message));

        this.log(`Tibber device ${this.getName()} has been initialized`);
        return this.fetchData();
	}

	async getTemperature() {
	    try {
	        const weather = await yrno.getWeather(this._location);
            let json = weather.getJson();
            let temperature = Number(_.get(json, 'weatherdata.product.time["0"].location.temperature.value'));
            if(temperature && temperature !== this._lastTemperature)
            {
                this.log('Triggering temperature_changed', temperature);
                this._temperatureChangedTrigger.trigger(this, temperature);
                this.setCapabilityValue('measure_temperature', temperature).catch(console.error);
                const loggerPrefix = this.getDriver().getDevices().length > 1 ? (`${this._deviceLabel} `) : '';
                let temperatureLogger = await this._createGetLog(`${this._insightId}_temperature`, {
                    label: `${loggerPrefix}Outdoor temperature`,
                    type: 'number',
                    decimals: true
                });
                temperatureLogger.createEntry(temperature, moment(json.weatherdata.product.time["0"].from).toDate()).catch();
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
        const priceInfo = _.get(data, 'viewer.home.currentSubscription.priceInfo.current');
        const loggerPrefix = this.getDriver().getDevices().length > 1 ? (`${this._deviceLabel} `) : '';

        if(_.get(priceInfo, 'startsAt') !== _.get(this._lastPrice, 'startsAt')) {
        	this._lastPrice = priceInfo;
            this._priceChangedTrigger.trigger(this, priceInfo);
            this.log('Triggering price_changed', priceInfo);

            if(priceInfo.total !== null) {
                this.setCapabilityValue("price_total", priceInfo.total).catch(console.error);
                let priceLogger = await this._createGetLog(`${this._insightId}_price`, {
                    label: `${loggerPrefix}Current price`,
                    type: 'number',
                    decimals: true
                });
                priceLogger.createEntry(priceInfo.total, moment(priceInfo.startsAt).toDate()).catch();
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

                    consumptionLogger.createEntry(dailyConsumption.consumption, moment(dailyConsumption.to).toDate()).catch();

                    let costLogger = await this._createGetLog(`${this._insightId}_dailyCost`, {
                        label: `${loggerPrefix}Daily total cost`,
                        type: 'number',
                        decimals: true
                    });
                    costLogger.createEntry(dailyConsumption.totalCost, moment(dailyConsumption.to).toDate()).catch();
                }
            });

            if (consumptionsSinceLastReport.length > 0)
                this._consumptionReportTrigger.trigger(this, {
                    consumption: _.sumBy(consumptionsSinceLastReport, 'consumption'),
                    totalCost: _.sumBy(consumptionsSinceLastReport, 'totalCost'),
                    unitCost: _.sumBy(consumptionsSinceLastReport, 'unitCost'),
                    unitPrice: _.meanBy(consumptionsSinceLastReport, 'unitPrice')
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

                    consumptionLogger.createEntry(hourlyConsumption.consumption, moment(hourlyConsumption.to).toDate()).catch();

                    let costLogger = await this._createGetLog(`${this._insightId}_hourlyCost`, {
                        label: `${loggerPrefix}Hourly total cost`,
                        type: 'number',
                        decimals: true
                    });
                    costLogger.createEntry(hourlyConsumption.totalCost, moment(hourlyConsumption.to).toDate()).catch();
                }
            });
        }
        catch (e) {
            console.error('Error logging hourly consumption', e);
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