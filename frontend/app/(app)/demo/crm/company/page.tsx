import { Content } from '@/components/layout/components/content';
import { Company } from './company';
import { PageHeader } from './page-header';

export default function CompanyPage() {
  return (
    <>
      <PageHeader />
      <Content className="grid py-0">
        <Company />
      </Content>
    </>
  );
}
