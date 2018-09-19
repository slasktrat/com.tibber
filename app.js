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

        setInterval(this.fetchData.bind(this), 120 * 1000);
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

	async fetchData() {
	    try {
            this.log('Fetching data...');
            let data = await tibber.getData();
            Homey.app.updateDevices(data);
            return data;
        }
        catch(e) {
	        this.error('Error fetching data', e);
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