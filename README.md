# Tibber

Integration with Tibber

First get an [access token](https://developer.tibber.com/settings/accesstoken) and paste it into the App settings page

## Flow

#### Supported flow triggers
- Price changed
- Consumption report

#### Supported conditions
- Current price below/above  

## Release notes

#### 0.0.3
- Replaced "Consumption prev hour" with "Consumption yesterday" as hourly consumption is only available after day has ended
- Added Insight logs for Daily consumption + Total cost and Hourly consumption + Total cost (logging back in time)

#### 0.0.2
- Added "Consumption prev hour" and "Current price" to mobile card   

#### 0.0.1
- Initial version 