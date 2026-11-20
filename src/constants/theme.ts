

export const colors = {
  light: {
    screenBg: '#f7f4f0',        // --app-background
    navBg: '#ffffff',           // --app-surface-elevated
    navBorder: '#d9d3cc',       // --app-border
    pillActive: '#eee7ef',      // --app-primary-container
    iconActive: '#26172e',      // --app-on-primary-container
    iconInactive: '#897f85',    // --app-text-muted
  },
  dark: {
    screenBg: '#17111b',        // --app-background
    navBg: '#302438',           // --app-surface-elevated
    navBorder: '#493a4e',       // --app-border
    pillActive: '#432e4a',      // --app-primary-container
    iconActive: '#f1e8f2',      // --app-on-primary-container
    iconInactive: '#a99bae',    // --app-text-muted
  },
};

export const spacing = {
    0:0,
    1:4,
    2:8,
    5:20,
    8:32,
    10:40,
    12:48,
    16:64,
    18:72,
    20:80
}

export const components = {
    tabBar: {
        widthPerPill: spacing[18],
        height: spacing[18],
        horizontalInset: spacing[5],
        radius: spacing[16],
        iconFrame: spacing[12],
        itemPaddingVertical: spacing[2],
        barPadding: spacing[20],
    },
} as const;

export const theme = {
    colors,
    spacing,
    components
} as const;