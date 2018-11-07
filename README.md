# Tibber

Integration with Tibber, with Pulse support!

## Flow cards

### Device: Home
#### Triggers
- Price changed
- Temperature changed
- Current price is at the lowest among the next [x] hours
- Current price is at the highest among the next [x] hours
- Current price is [x] percent below average of the next [y] hours
- Current price is [x] percent above average of the next [y] hours
- Consumption report (triggers when new data is available, normally once a week. Every hour if you have a Pulse device)

#### Conditions
- Current price below/above
- Outdoor temperature below/above

#### Actions
- Send push notification (through Tibber app)

### Device: Pulse
#### Triggers
- Power changed
- Consumption since midnight changed
- Cost since midnight changed
- Daily consumption report
  

### Release Notes

#### 1.0.1
- Added trigger cards for lowest/highest price among the next [x] hours

#### 1.0.0
- Initial public version