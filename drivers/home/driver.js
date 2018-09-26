'use strict';

const 	Homey 				= require('homey'),
		_                   = require('lodash'),
		tibber              = require('../../tibber'),
		request 			= require('request');

class MyDriver extends Homey.Driver {
	
	onInit() {
		this.log('Tibber driver driver has been initialized');
	}
    onPair( socket ) {
        socket.on('list_devices', this.onPairListDevices);
        if(Homey.app.isConnected())
            return socket.emit('authorized');

		let state = Math.random().toString(36).replace(/[^a-z]+/g, '').substr(0, 10);
		const redirectUrl = 'https://callback.athom.com/oauth2/callback/';
		let apiBaseUrl = 'https://thewall.tibber.com';
        let apiAuthUrl = `${apiBaseUrl}/connect/authorize?state=${state}&scope=tibber_graph&response_type=code&client_id=${Homey.env.CLIENT_ID}&redirect_uri=${redirectUrl}`;
		this.log('oauth', apiAuthUrl);

        let myOAuth2Callback = new Homey.CloudOAuth2Callback(apiAuthUrl);
        myOAuth2Callback
            .on('url', url => {
                socket.emit('url', url);
            })
            .on('code', code => {
                request.post({
                    url: `${apiBaseUrl}/connect/token`,
                    form: {
                        client_id: Homey.env.CLIENT_ID,
                        client_secret: Homey.env.CLIENT_SECRET,
                        grant_type: 'authorization_code',
                        redirect_uri: redirectUrl,
                        code: code,
                    },
                }, async (err, response, body) => {
                    if (err || response.statusCode !== 200) {
                        console.error('request failed', err);
                        socket.emit('error', new Error(`Request failed with code ${response.statusCode}`));
                        return Homey.app.error('api -> failed to fetch tokens', err || response.statusCode);
                    }

                    let params = JSON.parse(body);
                    try {
                        Homey.ManagerSettings.set('token', params.access_token);
                        Homey.ManagerSettings.set('token_expires_in', params.expires_in);

                        await tibber.init(params.access_token);
                        socket.emit('authorized');
                    } catch (err) {
                        socket.emit('error', new Error(`Error saving tokens`));
                        Homey.app.error('api -> error saving tokens:', err);
                    }
                });
            })
            .generate()
            .catch( err => {
            	console.error(err);
                socket.emit('error', err);
            });
    }

	onPairListDevices(data, callback) {
		if (!Homey.app.isConnected()) {
			callback(new Error("Unable to load your home(s)."));
		}
		else
		{
            Homey.app.fetchData()
                .then(data => {
                    let devices = _.map(_.get(data, 'viewer.homes'), home => {
                        let address = _.get(home, 'address.address1');
                        return {
                            data: {id: address},
                            name: address
                        };
                    });

                    callback(null, devices.sort(MyDriver._compareHomeyDevice));
                })
                .catch(e => {
                    this.log('Error in onPairListDevices', e);
                    callback(new Error("Failed to retrieve data."));
                });
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