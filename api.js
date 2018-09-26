'use strict';
const   Homey           = require('homey'),
        tibber          = require('tibber');



module.exports = [
    {
        method: 'POST',
        path: '/authenticate/',
        fn: async (args, callback) => {
            try {
                let result = await Homey.app.authenticate(args.body.token);
                return callback(null,result);
            } catch (err) {
                return callback(err);
            }
        } 
    },
    {
        method: 'POST',
        path: '/deauthorize',
        fn: (args, callback) => {
            console.log('deauthorizing');
            tibber.deinit();
            Homey.ManagerSettings.unset('token');
            Homey.ManagerSettings.set('authorized', false);
            Homey.ManagerApi.realtime('authorized', false);
            this.emit('authenticated', false);
        },
    },
];
