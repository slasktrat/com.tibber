const { GraphQLClient }           = require('graphql-request');

module.exports = {
    init:init,
    deinit: deinit,
    getData: getData,
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
      daily: consumption(resolution: DAILY, last: 1) {
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
      hourly: consumption(resolution: HOURLY, last: 25) {
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

async function getData() {
    if(!_client)
        throw new Error("Access token not set");
    return _client.request(query)
                    .then(data => {
                        _isConnected = true;
                        return data;
                    })
                    .catch(e => {
                        _isConnected = false;
                        console.error('Error while fetching data', e);
                    });
}
