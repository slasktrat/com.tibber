'use strict';

const 	Homey 				= require('homey'),
		_                   = require('lodash');

class MyDriver extends Homey.Driver {
	
	onInit() {
		this.log('Tibber driver driver has been initialized');
	}

	async onPairListDevices(data, callback) {
		if (!Homey.app.isConnected()) {
			callback(new Error("Please enter your access token in the settings page."));
		}
		else
		{
		    try {
                let data = await Homey.app.fetchData();
                let devices = _.map(_.get(data, 'viewer.homes'), home => {
                    let address = _.get(home, 'address.address1');
                    return {
                        data: {id: address},
                        name: address
                    };
                });

                callback(null, devices.sort(MyDriver._compareHomeyDevice));
            }
            catch(e) {
		        this.error('Error in onPairListDevices', e);
                callback(new Error("Failed to retrieve data."));
            }
		}
	}

	static _compareHomeyDevice(a, b) {
		if (a.name < b.name)
			return -1;
		if (a.name > b.name)
			return 1;
		return 0;
	}
}

module.exports = MyDriver;