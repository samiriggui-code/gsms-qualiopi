import { Content } from '@/components/layout/components/content';
import CompanyList from './company-list';
import { PageHeader } from './page-header';

export default function CompaniesListPage() {
  return (
    <>
      <PageHeader />
      <Content className="block py-0">
        <CompanyList />
      </Content>
    </>
  );
}
