import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';

function isReachable(state: NetInfoState): boolean {
  // NetInfo can report reachability as null while its first probe is pending.
  // In that case, use the connected state as a temporary best-effort signal.
  return state.isConnected === true && state.isInternetReachable !== false;
}

export const networkService = {
  async isOnline(): Promise<boolean> {
    return isReachable(await NetInfo.fetch());
  },
  subscribe(callback: (online: boolean) => void) {
    return NetInfo.addEventListener(state => callback(isReachable(state)));
  },
};
