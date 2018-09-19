const { GraphQLClient }           = require('graphql-request');

module.exports = {
    init:init,
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
      owner {
        firstName
        lastName
        contactInfo {
          email
          mobile
        }
      }
      consumption(resolution: HOURLY, last: 1) {
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
                        this.error('Error while fetching data', e);
                    });
}
