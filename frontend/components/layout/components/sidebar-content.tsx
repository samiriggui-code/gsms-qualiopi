'use client';

import { SidebarDefaultContent } from './sidebar-default-content';
import { SidebarDefaultFooter } from './sidebar-default-footer';
import { SidebarDefaultHeader } from './sidebar-default-header';

export function SidebarContent() {
  return (
    <>
      <SidebarDefaultHeader />
      <SidebarDefaultContent />
      <SidebarDefaultFooter />
    </>
  );
}
