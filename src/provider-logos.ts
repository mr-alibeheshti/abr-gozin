type ProviderLogo = { src: string; compactSrc?: string; dark?: boolean };

// Original provider assets; their source URLs are recorded in public/logos/sources.json.
export const providerLogos: Record<string, ProviderLogo> = {
  arvan: { src: "/logos/arvan.svg" },
  liara: { src: "/logos/liara.svg", compactSrc: "/logos/liara-compact.png" },
  iranserver: {
    src: "/logos/iranserver.svg",
    compactSrc: "/logos/iranserver-compact.png",
  },
  netafraz: { src: "/logos/netafraz.png" },
  parsvds: {
    src: "/logos/parsvds.png",
    compactSrc: "/logos/parsvds-compact.png",
    dark: true,
  },
  payamonline: {
    src: "/logos/payamonline.svg",
    compactSrc: "/logos/payamonline-compact.png",
  },
  mihanwebhost: {
    src: "/logos/mihanwebhost.svg",
    compactSrc: "/logos/mihanwebhost-compact.png",
  },
  serverir: {
    src: "/logos/serverir.webp",
    compactSrc: "/logos/serverir-compact.png",
    dark: true,
  },
  iranhost: {
    src: "/logos/iranhost.svg",
    compactSrc: "/logos/iranhost-compact.png",
  },
  mizbanfa: {
    src: "/logos/mizbanfa.png",
    compactSrc: "/logos/mizbanfa-compact.png",
  },
  azaronline: {
    src: "/logos/azaronline.svg",
    compactSrc: "/logos/azaronline-compact.svg",
  },
  bertina: { src: "/logos/bertina.png" },
  onlineserver: { src: "/logos/onlineserver.svg", dark: true },
  hidata: { src: "/logos/hidata.svg" },
  afagh: { src: "/logos/afagh.webp" },
  webdade: {
    src: "/logos/webdade.svg",
    compactSrc: "/logos/webdade-compact.png",
  },
  talahost: {
    src: "/logos/talahost.svg",
    compactSrc: "/logos/talahost-compact.svg",
  },
  hostnegar: { src: "/logos/hostnegar.webp" },
  mihanhosting: {
    src: "/logos/mihanhosting.png",
    compactSrc: "/logos/mihanhosting-compact.png",
  },
  mehrhost: {
    src: "/logos/mehrhost.webp",
    compactSrc: "/logos/mehrhost-compact.png",
    dark: true,
  },
};
