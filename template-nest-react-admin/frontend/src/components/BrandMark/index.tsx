export interface BrandMarkProps {
  /** 边长。登录页 44，Sider 28，加载页 44。 */
  size?: number;
}

/**
 * 品牌记号。三处消费方共用：登录页、Sider 品牌区、RequireAuth 加载页。
 * 用内联 SVG 而不是 public/logo.png：模板不携带二进制资源，换颜色/形状只改这里。
 *
 * 画布固定 44×44（viewBox），通过 width/height 缩放 —— 圆角与图形因此自动按比例，
 * 不要在 path 上再叠一层 `scale()`（会和 viewBox 的缩放重复）。
 */
export default function BrandMark({ size = 44 }: BrandMarkProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 44 44" role="img" aria-label="Logo">
      <defs>
        <linearGradient id="brand-mark-gradient" x1="0" y1="0" x2="44" y2="44" gradientUnits="userSpaceOnUse">
          <stop stopColor="#1677ff" />
          <stop offset="1" stopColor="#16c8db" />
        </linearGradient>
      </defs>
      <rect width="44" height="44" rx="12" fill="url(#brand-mark-gradient)" />
      <path
        d="M13 23.5 19 29l12-14"
        fill="none"
        stroke="#fff"
        strokeWidth="3.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
