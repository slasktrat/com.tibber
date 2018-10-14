# Tibber

Integration with Tibber, now with Pulse support!

## Flow cards

### Device: Home
#### Triggers
- Price changed
- Consumption report
- Temperature changed

#### Conditions
- Current price below/above

#### Actions
- Send push notification (through Tibber app)

### Device: Pulse
#### Triggers
- Power changed
- Consumption since midnight changed
- Cost since midnight changed
  

## Release notes

#### 0.1.0
- Added Pulse support, with flow trigger cards for power, consumption since midnight and cost since midnight changed  
- Removed unused capabilities and added outdoor temperature instead
- Because of major rewrite, users of previous versions will need to remove and add their home again as a new device  

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