import { act, renderHook, waitFor } from "@testing-library/react-native";

import { loadSuitabilityImage } from "./suitabilityImageCache";
import { getSuitabilityLayer, type SuitabilityLayer } from "./suitabilityLayers";
import { useSuitabilityImage } from "./useSuitabilityImage";

jest.mock("./suitabilityImageCache", () => ({ loadSuitabilityImage: jest.fn() }));
const loadImage = jest.mocked(loadSuitabilityImage);
const koala = getSuitabilityLayer("koala")!;
const wombat = { ...getSuitabilityLayer("common-wombat")!, image: 200 };

beforeEach(() => { loadImage.mockReset(); });

it("offers a retry after preparation fails", async () => {
  loadImage.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce("file:///cache/koala.png");
  const { result } = await renderHook(() => useSuitabilityImage(koala));
  await waitFor(() => expect(result.current.status).toBe("error"));
  expect(result.current.uri).toBeUndefined();
  await act(async () => { result.current.retry(); });
  await waitFor(() => expect(result.current.uri).toBe("file:///cache/koala.png"));
  expect(result.current.status).toBe("ready");
});

it("ignores a late result for the old species and clears the overlay when leaving Prediction", async () => {
  let resolveKoala!: (uri: string) => void;
  loadImage.mockImplementationOnce(() => new Promise(resolve => { resolveKoala = resolve; }))
    .mockResolvedValueOnce("file:///cache/wombat.png");
  const { result, rerender } = await renderHook(
    ({ layer }: { layer?: SuitabilityLayer }) => useSuitabilityImage(layer),
    { initialProps: { layer: koala } },
  );
  expect(result.current.status).toBe("loading");
  await rerender({ layer: wombat });
  await waitFor(() => expect(result.current.uri).toBe("file:///cache/wombat.png"));
  await act(async () => { resolveKoala("file:///cache/koala.png"); });
  expect(result.current.uri).toBe("file:///cache/wombat.png");
  await rerender({ layer: undefined });
  expect(result.current.uri).toBeUndefined();
});
