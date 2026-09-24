// Default data source. Practice mode keeps sample data in this browser.
// To use the Power Automate flow, copy config.local.example.js to config.local.js.
window.DRC_CONFIG = {
  backend: 'mock',
  FLOW_URL: '',
  // Which date control each role sees. David has not picked variant A or B yet.
  // chip: compact "Today" chip. Change date opens the month (staff side of A).
  // month: the full month stays on the page (variant B, and the admin side of A).
  // Unknown values act as chip. Both pieces stay in the page either way.
  calendar: {
    staff: 'chip',
    admin: 'chip',
  },
};
