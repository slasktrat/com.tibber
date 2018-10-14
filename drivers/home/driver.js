'use strict';

const 	Homey 				= require('homey'),
		_                   = require('lodash'),
		request 			= require('request'),
        tibber              = require('../../tibber');

class MyDriver extends Homey.Driver {
	
	onInit() {
		this.log('Tibber home driver has been initialized');
	}
    onPair( socket ) {
        socket.on('list_devices', this.onPairListDevices);

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

                    try {
                        let params = JSON.parse(body);
                        tibber.setDefaultToken(params.access_token);
                        socket.emit('authorized');
                    } catch (err) {
                        socket.emit('error', new Error(`Error fetching tokens`));
                        Homey.app.error('api -> error fetching tokens:', err);
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
        tibber.getHomes()
            .then(data => {
                let devices = _.reject(_.map(_.get(data, 'viewer.homes'), home => {
                    let isActive = _.get(home, 'currentSubscription.status') === 'running';
                    if(!isActive)
                        return null;

                    _.assign(home, {t:tibber.getDefaultToken()});
                    let address = _.get(home, 'address.address1');
                    return {
                        data: home,
                        name: address
                    };
                }), _.isNull);

                callback(null, devices.sort(MyDriver._compareHomeyDevice));
            })
            .catch(e => {
                this.log('Error in onPairListDevices', e);
                callback(new Error("Failed to retrieve data."));
            });
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