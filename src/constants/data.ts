import { Home, Layout, Settings, ClipboardEdit } from "lucide-react-native";


export const tabs = [
    {name: 'index', title: 'Home', icon: Home},
    {name: 'database', title: 'Database', icon: Layout},
    {name: 'quick-entry', title: 'Quick Entry', icon: ClipboardEdit},
    {name: 'settings', title: 'Settings', icon: Settings}
]

export const LOADING_TIMEOUT = 10000;