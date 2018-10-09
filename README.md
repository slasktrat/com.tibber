# Tibber

Integration with Tibber

## Flow

#### Supported flow triggers
- Price changed
- Consumption report

#### Supported conditions
- Current price below/above  

## Release notes

#### 0.0.9
- Added action flow card: Send Tibber push notification (sends push notification through Tibber app)
- Rewrote consumption report flow trigger card to report total consumption since last report, as consumption data is made available in variable intervals

#### 0.0.7
- Removed consumption from mobile card as latest available data can be up to one week old
- Improved consumption logging

#### 0.0.6
- Implemented OAuth for easier authentication 

#### 0.0.3
- Replaced "Consumption prev hour" with "Consumption yesterday" as hourly consumption is only available after day has ended
- Added Insight logs for Daily consumption + Total cost and Hourly consumption + Total cost (logging back in time)

#### 0.0.2
- Added "Consumption prev hour" and "Current price" to mobile card   

#### 0.0.1
- Initial version 