import React from 'react';
import { errorService } from '../services/errorService.js';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
    this.lastRecoverySignature = null;
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    errorService.report(error, {
      scope: 'ui',
      route: this.props.route ?? null,
      componentStack: info?.componentStack ?? '',
    });

    // 页面级渲染异常不再弹出阻塞式错误窗口。
    // 同一种异常只自动恢复一次，避免持续异常形成重试死循环。
    const signature = [
      error?.name ?? 'Error',
      error?.message ?? String(error),
      this.props.route ?? '',
    ].join('|');

    if (signature !== this.lastRecoverySignature) {
      this.lastRecoverySignature = signature;
      this.props.onReset?.();
      setTimeout(() => {
        this.setState({ hasError: false, error: null });
      }, 0);
    }
  }

  reset = () => {
    this.lastRecoverySignature = null;
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    return this.props.fallback ?? null;
  }
}
