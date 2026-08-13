import { CheckCircle2, Monitor, ShieldAlert } from "lucide-react";

export default function AmazonAuthorizationPage() {
  return <div className="section-page"><h1 className="section-title">Amazon 授权</h1><p className="section-subtitle">首期采用固定、未登录的 Amazon.com 浏览器观察，不需要卖家账户授权。</p><div className="content-grid-2"><section className="panel content-panel"><Monitor size={32} color="#075be8" /><h2 style={{ marginTop: 12 }}>首期数据路径</h2><ul className="guide-bullets"><li>Amazon 美国站普通搜索结果页。</li><li>未登录、非持久化、固定邮编与显示环境。</li><li>直接访问 /dp/ASIN 获取可见详情，不点击搜索卡片。</li><li>遇到验证码立即停止，不尝试破解或外包。</li></ul></section><section className="panel content-panel"><ShieldAlert size={32} color="#f08a16" /><h2 style={{ marginTop: 12 }}>官方 API 后续接入</h2><p className="section-subtitle" style={{ lineHeight: 1.7 }}>未来只有在正式取得相应 Amazon 开发者应用资格、用户明确授权且字段确实可用时，才接入 OAuth/API。不会把“计划支持”写成“已经授权”。</p><div className="notice notice-info"><CheckCircle2 size={17} />当前状态：无需授权，也没有读取任何卖家后台数据。</div></section></div></div>;
}
