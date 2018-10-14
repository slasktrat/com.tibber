module.exports = {
    getHomesQuery: getHomesQuery,
    getPriceQuery: getPriceQuery,
    getConsumptionQuery: getConsumptionQuery,
    getPushMessage: getPushMessage
};

function getHomesQuery() {
    return `{
      viewer {
        homes {
          id
          timeZone
          address {
            address1
            postalCode
            city
            latitude
            longitude
          }
          features {
            realTimeConsumptionEnabled
          }
          currentSubscription {
            status
          }
        }
      }
    }`;
}

function getPriceQuery(homeId) {
    return `{
      viewer {
        home(id:"${homeId}") {
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
}

function getConsumptionQuery(homeId) {
    return `{
          viewer {
            home(id:"${homeId}") {
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
            }
        }
    }`;
}

function getPushMessage(title, message) {
    return `mutation{
        sendPushNotification(input: {
            title: "${title}",
                message: "${message}",
                screenToOpen: CONSUMPTION
        }){
            successful
            pushedToNumberOfDevices
        }
    }`;
}