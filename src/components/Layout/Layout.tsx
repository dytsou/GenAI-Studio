import React, { ReactNode } from 'react';
import './Layout.css';
import { Sidebar } from '../Sidebar/Sidebar';

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  return (
    <div className="layout-container">
      <Sidebar />
      <main className="layout-main">
        {children}
      </main>
    </div>
  );
}
