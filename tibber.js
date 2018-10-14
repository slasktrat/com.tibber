const   Homey 				        = require('homey'),
        { GraphQLClient }           = require('graphql-request'),
        queries                     = require('./queries');

module.exports = {
    init:init,
    getHomes: getHomes,
    getData: getData,
    sendPush: sendPush,
    setDefaultToken: setDefaultToken,
    getDefaultToken: getDefaultToken
};

let _clients = [];
function init(token) {
    if(!_clients[token])
        _clients[token] = new GraphQLClient('https://api.tibber.com/v1-beta/gql', {
        headers: {
            Authorization: `Bearer ${token}`,
        },
    });

    return _clients[token];
}

function getClient(token) {
    if(!token)
        token = getDefaultToken();
    if(!token)
        throw new Error("Access token not set");

    return _clients[token] || init(token);
}

async function getHomes(token) {
    let client = getClient(token);
    return client.request(queries.getHomesQuery())
        .then(data => {
            return data;
        })
        .catch(e => {
            console.error('Error while fetching data', e);
        });
}

async function getData(token, homeId) {
    let client = getClient(token);
    return client.request(queries.getConsumptionQuery(homeId))
                    .then(data => {
                        return data;
                    })
                    .catch(e => {
                        console.error('Error while fetching data', e);
                    });
}

async function sendPush(token, title, message) {
    let client = getClient(token);
    let push = queries.getPushMessage(title, message);
    return client.request(push)
        .then(result => {
            console.log('Push notification sent', result);
        })
        .catch(console.error);
}

function setDefaultToken(token) {
    Homey.ManagerSettings.set('token', token);
}

function getDefaultToken() {
    return Homey.ManagerSettings.get('token');
}