import { Asset } from "expo-asset";

import { loadSuitabilityImage, preloadSuitabilityImages } from "./suitabilityImageCache";
import { MVP_SPECIES } from "../species";

jest.mock("expo-asset", () => ({ Asset: { fromModule: jest.fn(), fromURI: jest.fn() } }));

type MockAsset = {
  uri: string;
  localUri: string | null;
  downloadAsync: jest.Mock<Promise<MockAsset>, []>;
};

function makeAsset(localUri: string | null = null): MockAsset {
  const asset: MockAsset = {
    uri: "http://127.0.0.1:8081/assets/koala.png",
    localUri,
    downloadAsync: jest.fn(async () => { asset.localUri = "file:///cache/koala.png"; return asset; }),
  };
  return asset;
}

beforeEach(() => { jest.clearAllMocks(); });
afterEach(() => { jest.useRealTimers(); });

it("downloads to the device and never returns the Metro URL", async () => {
  const asset = makeAsset();
  jest.mocked(Asset.fromModule).mockReturnValue(asset as unknown as Asset);
  await expect(loadSuitabilityImage(101)).resolves.toBe("file:///cache/koala.png");
  expect(asset.downloadAsync).toHaveBeenCalledTimes(1);
});

it.each([null, "http://127.0.0.1:8081/assets/koala.png"])("rejects a missing or non-local URI (%s)", async localUri => {
  const asset = makeAsset(localUri);
  asset.downloadAsync.mockImplementation(async () => asset);
  jest.mocked(Asset.fromModule).mockReturnValue(asset as unknown as Asset);
  await expect(loadSuitabilityImage(102)).rejects.toThrow("not available on this device");
});

it("coalesces concurrent requests and permits retry after a failed download", async () => {
  const asset = makeAsset();
  let rejectDownload!: (reason: Error) => void;
  asset.downloadAsync.mockImplementationOnce(() => new Promise((_, reject) => { rejectDownload = reject; }));
  jest.mocked(Asset.fromModule).mockReturnValue(asset as unknown as Asset);
  const first = loadSuitabilityImage(103);
  expect(loadSuitabilityImage(103)).toBe(first);
  const rejected = expect(first).rejects.toThrow("offline");
  rejectDownload(new Error("offline"));
  await rejected;
  await expect(loadSuitabilityImage(103)).resolves.toBe("file:///cache/koala.png");
  expect(asset.downloadAsync).toHaveBeenCalledTimes(2);
});

it("extracts Android drawable resources before handing them to the map", async () => {
  const bundled = makeAsset("assets_suitability_koala");
  const extracted = makeAsset();
  jest.mocked(Asset.fromModule).mockReturnValue(bundled as unknown as Asset);
  jest.mocked(Asset.fromURI).mockReturnValue(extracted as unknown as Asset);
  await expect(loadSuitabilityImage(104)).resolves.toBe("file:///cache/koala.png");
  expect(Asset.fromURI).toHaveBeenCalledWith("assets_suitability_koala");
  expect(bundled.downloadAsync).not.toHaveBeenCalled();
});

it("times out a stalled preparation rather than leaving the user waiting indefinitely", async () => {
  jest.useFakeTimers();
  const asset = makeAsset();
  asset.downloadAsync.mockImplementation(() => new Promise(() => {}));
  jest.mocked(Asset.fromModule).mockReturnValue(asset as unknown as Asset);
  const rejected = expect(loadSuitabilityImage(105)).rejects.toThrow("timed out");
  await jest.advanceTimersByTimeAsync(10_000);
  await rejected;
});

it("prepares all seven species and contains failures without an unhandled rejection", async () => {
  const asset = makeAsset();
  asset.downloadAsync.mockRejectedValue(new Error("development server stopped"));
  jest.mocked(Asset.fromModule).mockReturnValue(asset as unknown as Asset);
  const results = await preloadSuitabilityImages();
  expect(results).toHaveLength(MVP_SPECIES.length);
  expect(results.every(result => result.status === "rejected")).toBe(true);
});
