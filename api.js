'use strict';
const Homey = require('homey');
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
    }
];
