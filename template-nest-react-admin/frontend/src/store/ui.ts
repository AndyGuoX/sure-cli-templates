import { create } from 'zustand';

interface UiState {
  /** 侧栏是否收起。全局客户端态，不需要服务端参与。 */
  siderCollapsed: boolean;
  toggleSider: () => void;
}

/**
 * 全局 UI 状态。只放「跨组件共享 + 不来自后端 + props 传递会变成 prop drilling」三者的交集；
 * 服务端数据一律归 react-query。
 */
export const useUiStore = create<UiState>((set) => ({
  siderCollapsed: false,
  toggleSider: () => set((state) => ({ siderCollapsed: !state.siderCollapsed })),
}));
