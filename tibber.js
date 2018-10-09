const { GraphQLClient }           = require('graphql-request');

module.exports = {
    init:init,
    deinit: deinit,
    getData: getData,
    sendPush: sendPush,
    isConnected: isConnected
};

const query = `{
  viewer {
    homes {
      timeZone
      address {
        address1
        postalCode
        city
      }
      currentSubscription {
        status
        priceInfo {
          current {
            total
            energy
            tax
            startsAt
          }
        }
      }
    }
  }
}`;

const queryFull = `{
  viewer {
    homes {
      timeZone
      address {
        address1
        postalCode
        city
      }
      daily: consumption(resolution: DAILY, last: 14) {
        nodes {
          from
          to
          totalCost
          unitCost
          unitPrice
          unitPriceVAT
          consumption
          consumptionUnit
        }
      },
      hourly: consumption(resolution: HOURLY, last: 200) {
        nodes {
          from
          to
          totalCost
          consumption
        }
      }
      currentSubscription {
        status
        priceInfo {
          current {
            total
            energy
            tax
            startsAt
          }
        }
      }
    }
  }
}`;

let _client;
let _isConnected;

function init(token) {
    _client = new GraphQLClient('https://api.tibber.com/v1-beta/gql', {
        headers: {
            Authorization: `Bearer ${token}`,
        },
    });

    return getData();
}

function deinit() {
    _client = undefined;
    _isConnected = false;
}

function isConnected() {
    return _isConnected;
}

async function getData(full) {
    if(!_client)
        throw new Error("Access token not set");
    return _client.request(full ? queryFull : query)
                    .then(data => {
                        _isConnected = true;
                        return data;
                    })
                    .catch(e => {
                        _isConnected = false;
                        console.error('Error while fetching data', e);
                    });
}

async function sendPush(title, message) {
    let push = `mutation{
        sendPushNotification(input: {
            title: "${title}",
                message: "${message}",
                screenToOpen: CONSUMPTION
        }){
            successful
            pushedToNumberOfDevices
        }
    }`;
    return _client.request(push)
        .then(result => {
            this.log('Push notification sent', result);
        })
        .catch(console.error);
}