import { ImportWizard } from './import-wizard';

export const metadata = {
  title: 'Import Wizard — Arch Atlas Studio',
  description: 'Import architecture.review.yaml files and build architecture diagrams',
};

export default function ImportPage() {
  return <ImportWizard />;
}
