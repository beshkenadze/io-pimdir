// SQL is embedded verbatim; the old draft edited its only migration in place.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const read = path => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');
export function snapshots() {
  return [
    { name: 'old', revision: '8907303', schema: read('fixtures/old/schema.sql'), init: read('fixtures/old/init.sql'),
      origin: read('fixtures/old/origin.sql'), destination: read('fixtures/old/destination.sql') },
    { name: 'current', revision: '73e2aea', schema: read('../../spec/migrations/storage/0001_init.sql'), init: read('../../spec/queries/storage/owner/init_store_meta.sql'),
      origin: read('../../spec/queries/storage/owner/origin_for_link.sql'),
      destination: read('../../spec/queries/storage/owner/destination_for_link.sql') },
  ];
}
