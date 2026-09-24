// Default data source. Practice mode keeps sample data in this browser.
// To use the Power Automate flow, copy config.local.example.js to config.local.js.
window.DRC_CONFIG = {
  backend: 'mock',
  FLOW_URL: '',
  // Which date control each role sees.
  // chip: compact "Today" chip. Change date opens the full month.
  // month: the full month stays on the page, with a dot on days that have a claim.
  // Change these when the final layout is chosen. Unknown values act as chip.
  calendar: {
    staff: 'chip',
    admin: 'chip',
  },
};
