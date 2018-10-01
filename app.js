'use strict';

const 	Homey 				= require('homey'),
		_					= require('lodash'),
		tibber				= require('./tibber');

class TibberApp extends Homey.App {
	
	onInit() {
        this._tibberHomeDriver = Homey.ManagerDrivers.getDriver('home');

		this.log('Tibber app is running...');

		this._initTibber()
            .then(this.updateDevices)
            .catch(e => console.warn('Tibber not initialized', e));

        setInterval(this.fetchData.bind(this), 120 * 1000); //Every other minute
        setInterval(this.fetchData.bind(this, [true]), 60 * 60 * 1000); //Every hour

        let v = Homey.ManagerSettings.get('v');
        if(!v) {
            this.log('Cleaning logs');
            Homey.ManagerSettings.set('v', 1);
            this.cleanupLogs();
        }
	}

    isConnected() {
        return tibber.isConnected();
    }

    updateDevices(data) {
	    const that = Homey.app;
        if(that._tibberHomeDriver) {
            _.each(_.get(data, 'viewer.homes'), home => {
                let deviceId = _.get(home, 'address.address1');
                let homeyDevice = that._tibberHomeDriver.getDevice({id: deviceId});
                if (homeyDevice instanceof Error) return;

                homeyDevice.onData.call(homeyDevice, home);
            });
        }
    }

    async cleanupLogs() {
        let logs = await Homey.ManagerInsights.getLogs();
        _.each(logs, async log => {
            console.log('Deleting log',log.name);
            await Homey.ManagerInsights.deleteLog(log);
        })
    }

	async fetchData(full) {
	    try {
            this.log(`Fetching data (${!!full})...`);
            let data = await tibber.getData(full);
            Homey.app.updateDevices(data);
            return data;
        }
        catch(e) {
	        this.log('Error fetching data', e);
        }
	}

    async authenticate(token) {
        return tibber.init(token);
    }

    async _initTibber() {
        let accessToken = Homey.ManagerSettings.get('token');
        if(accessToken)
            return tibber.init(accessToken);
    }
}

module.exports = TibberApp;