import { describe, expect, it } from 'vitest';
import {
  extractGrpcClientRefs,
  normalizeServiceName,
  serviceNamesMatch,
} from '../../src/correlate/evidence/parsers/grpc.js';

describe('extractGrpcClientRefs — per-language construction forms', () => {
  it('Go: [pkg.]New<Name>ServiceClient(', () => {
    const refs = extractGrpcClientRefs(
      'internal/catalog/client.go',
      'func dial(conn *grpc.ClientConn) {\n\tclient := pb.NewProductCatalogServiceClient(conn)\n\t_ = client\n}\n'
    );
    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({
      relPath: 'internal/catalog/client.go',
      line: 2,
      service: 'ProductCatalogService',
      form: 'go',
    });
  });

  it('Go: bare NewCartServiceClient( with no package qualifier', () => {
    const refs = extractGrpcClientRefs('rpc.go', 'c := NewCartServiceClient(cc)\n');
    expect(refs).toEqual([{ relPath: 'rpc.go', line: 1, service: 'CartService', form: 'go' }]);
  });

  it('C#: new [Ns.]<Name>.<Name>Client( nested-type form', () => {
    const refs = extractGrpcClientRefs(
      'CartClient.cs',
      'var client = new Oteldemo.CartService.CartServiceClient(channel);\n'
    );
    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({ service: 'CartService', form: 'csharp', line: 1 });
  });

  it('Node/JS: new [ns.]<Name>ServiceClient(', () => {
    const refs = extractGrpcClientRefs(
      'src/rpc.ts',
      'const stub = new proto.hipstershop.RecommendationServiceClient(addr, creds);\n'
    );
    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({ service: 'RecommendationService', form: 'node' });
  });

  it('Python: <mod>_pb2_grpc.<Name>Stub(', () => {
    const refs = extractGrpcClientRefs(
      'recommendation_server.py',
      'channel = grpc.insecure_channel(addr)\nstub = demo_pb2_grpc.ProductCatalogServiceStub(channel)\n'
    );
    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({ service: 'ProductCatalogService', form: 'python', line: 2 });
  });

  it('Java: <Name>Grpc.newBlockingStub(', () => {
    const refs = extractGrpcClientRefs(
      'AdClient.java',
      'AdServiceBlockingStub s = AdServiceGrpc.newBlockingStub(channel);\n'
    );
    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({ service: 'AdService', form: 'java' });
  });

  it('generic fallback: <Name>ServiceStub( in an unmodelled language', () => {
    const refs = extractGrpcClientRefs(
      'client.rb',
      'stub = ShippingServiceStub(host, :this_channel_is_insecure)\n'
    );
    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({ service: 'ShippingService', form: 'generic' });
  });
});

describe('extractGrpcClientRefs — negatives (MUST NOT emit)', () => {
  it.each([
    ['HTTP client', 'const c = new HttpClient(baseUrl);'],
    ['Apollo client', 'const client = new ApolloClient({ uri });'],
    ['Prisma client', 'const prisma = new PrismaClient();'],
    ['AWS SDK client', 'const s3 = new S3Client({ region });'],
    ['redis factory', 'const r = redis.createClient({ url });'],
    ['Go redis client', 'rdb := redis.NewClient(&redis.Options{})'],
    ['Go mongo client', 'm := mongo.NewDatabaseClient(cfg)'],
    ['bare Go type decl', 'var c pb.CatalogServiceClient'],
    ['TS import', "import { CartServiceClient } from './gen/cart';"],
    ['Python import', 'from demo_pb2_grpc import ProductCatalogServiceStub'],
    ['Java import', 'import shop.ProductCatalogServiceGrpc;'],
    ['line comment', '// client := pb.NewCartServiceClient(conn)'],
    ['string literal', 'const label = "NewCartServiceClient(conn)";'],
  ])('%s', (_label, line) => {
    expect(extractGrpcClientRefs('f.txt', `${line}\n`)).toEqual([]);
  });

  it('skips generated code files wholesale', () => {
    const generated =
      'func NewCartServiceClient(cc grpc.ClientConnInterface) CartServiceClient {\n' +
      '\treturn &cartServiceClient{cc}\n}\n';
    expect(extractGrpcClientRefs('genproto/demo.pb.go', generated)).toEqual([]);
    expect(
      extractGrpcClientRefs('hipstershop/demo_pb2_grpc.py', 'X = FooServiceStub(ch)\n')
    ).toEqual([]);
    // ...but the same construction in a hand-written file IS picked up.
    expect(extractGrpcClientRefs('rpc.go', 'c := NewCartServiceClient(cc)\n')).toHaveLength(1);
  });

  it('skips test sources (a repo often builds a client for its own service in tests)', () => {
    const line = 'c := NewCartServiceClient(cc)\n';
    expect(extractGrpcClientRefs('cartservice/tests/CartServiceTests.cs', line)).toEqual([]);
    expect(extractGrpcClientRefs('internal/cart/client_test.go', line)).toEqual([]);
    expect(extractGrpcClientRefs('src/rpc.spec.ts', line)).toEqual([]);
    expect(extractGrpcClientRefs('test_rpc.py', line)).toEqual([]);
    // ...but a non-test path with "it" or "test" as a substring is fine.
    expect(extractGrpcClientRefs('cmd/audit/http.go', line)).toHaveLength(1);
  });

  it('ignores a Go generated constructor *definition* even outside genproto/', () => {
    expect(
      extractGrpcClientRefs(
        'demo.go',
        'func NewCartServiceClient(cc grpc.ClientConnInterface) CartServiceClient {\n\treturn nil\n}\n'
      )
    ).toEqual([]);
  });
});

describe('extractGrpcClientRefs — ordering & de-duplication', () => {
  it('emits refs in ascending line order regardless of source order', () => {
    const src = [
      'package x', // 1
      'b := NewShippingServiceClient(cc)', // 2
      '', // 3
      '', // 4
      'a := NewCartServiceClient(cc)', // 5
      '', // 6
      '', // 7
      '', // 8
      'c := NewCurrencyServiceClient(cc)', // 9
    ].join('\n');
    expect(extractGrpcClientRefs('f.go', src).map((r) => r.line)).toEqual([2, 5, 9]);
  });

  it('collapses a line matching multiple forms to one ref with the specific form', () => {
    // matches both `go` and `generic`
    const refs = extractGrpcClientRefs('f.go', 'x := pb.NewCartServiceClient(cc)\n');
    expect(refs).toHaveLength(1);
    expect(refs[0]?.form).toBe('go');
  });
});

describe('normalizeServiceName', () => {
  it.each([
    ['hipstershop.CartService', 'cart'],
    ['CartService', 'cart'],
    ['ProductCatalogService', 'productcatalog'],
    ['product-catalog-service', 'productcatalog'],
    ['AdService', 'ad'],
    ['shop.v1.ShippingService', 'shipping'],
    ['Health', 'health'],
  ])('%s → %s', (raw, expected) => {
    expect(normalizeServiceName(raw)).toBe(expected);
  });
});

describe('serviceNamesMatch', () => {
  const cases: Array<[string, string, boolean]> = [
    ['hipstershop.CartService', 'CartService', true],
    ['CartService', 'cartservice', true],
    ['ProductCatalogService', 'product-catalog-service', true],
    ['CartService', 'CheckoutService', false],
    ['AdService', 'AddressService', false],
  ];
  it.each(cases)('%s ~ %s = %s', (a, b, expected) => {
    expect(serviceNamesMatch(a, b)).toBe(expected);
    expect(serviceNamesMatch(b, a)).toBe(expected); // symmetric
  });
});
