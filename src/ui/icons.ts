import itemAssets from '../data/item-assets.json';
const shapes: Record<string, string> = {
  shop: '<path fill="#997042" d="M3 10h18v12H3zM5 2h14l4 7v3H1V9z"/><path fill="#efd5a0" d="M5 12h14v8H5z"/><path fill="#dc9b52" d="M5 3h3v7H2V8zm6 0h3v7h-3zm6 0h2l3 5v2h-5z"/><path fill="#fff1cb" d="M8 3h3v7H8zm6 0h3v7h-3z"/><path fill="#97734c" d="M8 14h8v8H8z"/>',
  fur: '<path fill="#ae9b7b" d="M5 4h5v3h4V4h5v6h3v7h-4v5H6v-5H2v-7h3z"/><path fill="#fff2dc" d="M6 7h4v4h4V7h4v7h2v2h-4v4H8v-4H4v-2h2z"/>',
  wool: '<path fill="#c7b291" d="M5 3h14v3h3v13h-3v3H5v-3H2V6h3z"/><path fill="#fff3db" d="M6 5h12v3h2v9h-3v3H7v-3H4V8h2z"/><path fill="#dbcaab" d="M9 7h7v3h-4v3h5v4H8v-3H6v-3h3z"/>',
  truffle: '<path fill="#5e4634" d="M7 4h10v3h4v11h-4v4H6v-4H2V9h5z"/><path fill="#947352" d="M8 6h8v3h3v7h-4v4H7v-4H4v-5h4z"/><path fill="#c1a279" d="M9 8h3v3H9zm5 6h3v3h-3z"/>',
  voidEgg: '<path fill="#49374f" d="M9 2h6v3h3v4h2v10h-3v3H7v-3H4V9h2V5h3z"/><path fill="#705176" d="M10 4h4v3h3v5h2v6h-3v3H8v-3H5v-6h2V7h3z"/><path fill="#e68370" d="M9 10h3v3H9zm5 5h3v3h-3z"/>',
  star: '<path fill="#f4c54d" stroke="#9b632e" d="m12 2 3 6h7v4l-5 3 2 7-7-4-7 4 2-7-5-3V8h7z"/><path fill="#fff1a4" d="M11 5h2v8h-2zM7 9h4v2H7z"/>',
  coin: '<path fill="#b57a2e" d="M7 2h10v2h3v3h2v10h-2v3h-3v2H7v-2H4v-3H2V7h2V4h3z"/><path fill="#f8d359" d="M7 4h10v2h2v12h-2v2H7v-2H5V6h2z"/><path fill="#b98929" d="M11 7h3v10h-3z"/><path fill="#fff2b2" d="M7 7h2v9H7z"/>',
  carrot: '<path fill="#46723d" d="M13 2h3v5h2V3h3v5h-5v3h-4V7h-3V4h3v2h1z"/><path fill="#b35b29" d="M9 8h7v3h3v5h-3v3h-4v3H4v-7h3v-4h2z"/><path fill="#ef9b3b" d="M10 9h5v3h2v3h-3v3h-4v2H6v-5h3z"/><path fill="#ffd06d" d="M10 10h3v2h-3zM7 15h3v2H7z"/>',
  corn: '<path fill="#5c873c" d="M3 10h4v4h3V6h4v10h3V9h4v9h-3v3H6v-3H3z"/><path fill="#bc8831" d="M9 2h7v3h3v12h-3v3H9v-3H7V5h2z"/><path fill="#f2cb54" d="M10 3h5v3h2v10h-3v3h-4v-3H9V6h1z"/><path fill="#fff0a0" d="M11 5h2v2h-2zm0 4h2v2h-2zm0 4h2v2h-2z"/><path fill="#78a64b" d="M3 12h3v4h3v3h4v3H8v-3H5v-3H3zm18 0v6h-3v3h-4v-3h3v-3h2v-3z"/>',
  berry: '<path fill="#487342" d="M7 3h4V1h3v3h5v4H5V5h2z"/><path fill="#b64e4e" d="M5 7h14v3h3v7h-3v3h-4v3H9v-3H5v-3H2v-7h3z"/><path fill="#ed7970" d="M6 8h10v3h3v6h-4v3h-5v-3H6v-3H4v-4h2z"/><path fill="#ffdf91" d="M7 10h2v2H7zm6 2h2v2h-2zm-4 4h2v2H9z"/>',
  egg: '<path fill="#aa8760" d="M9 2h6v3h3v4h2v10h-3v3H7v-3H4V9h2V5h3z"/><path fill="#fff0c6" d="M10 3h4v3h3v4h2v8h-3v3H8v-3H5v-8h2V6h3z"/><path fill="#fffbed" d="M9 7h3v3H9zm-2 4h3v6H7z"/>',
  milk: '<path fill="#4e7583" d="M8 2h8v4h-1v2h3v3h2v11H4V11h2V8h3V6H8z"/><path fill="#b5d6d9" d="M9 3h6v2H9zM7 9h10v3h2v8H5v-8h2z"/><path fill="#fff7dd" d="M6 14h12v6H6z"/><path fill="#6793b1" d="M7 2h10v3H7zM6 16h12v2H6z"/>',
  fish: '<path fill="#456e88" d="M5 7h6V4h5v4h4v3h3v4h-3v3h-7v3H9v-4H5v3H1V6h4z"/><path fill="#9bcbd4" d="M6 9h5V7h5v2h4v3h2v2h-4v3h-6v-2H6z"/><path fill="#e0edf0" d="M9 10h9v3H9z"/><path fill="#36505c" d="M18 10h2v2h-2z"/>',
  koi: '<path fill="#79674d" d="M5 7h6V4h5v4h4v3h3v4h-3v3h-7v3H9v-4H5v3H1V6h4z"/><path fill="#fff4d7" d="M6 9h5V7h5v2h4v3h2v2h-4v3h-6v-2H6z"/><path fill="#e48b62" d="M8 9h4v6H8zm6 1h4v3h-4z"/><path fill="#36505c" d="M19 10h2v2h-2z"/>',
  seed: '<path fill="#93734b" d="M6 2h12v3h-1v3h2v14H5V8h2V5H6z"/><path fill="#e8c58a" d="M7 3h10v2H7zm0 6h10v11H7z"/><path fill="#73914e" d="M10 11h2v3h3v3h-4v2H9v-4H8v-3h2z"/>',
  ancientSeed: '<path fill="#71517e" d="M6 2h12v3h-1v3h2v14H5V8h2V5H6z"/><path fill="#d9c0dd" d="M7 3h10v2H7zm0 6h10v11H7z"/><path fill="#9a6ab2" d="m12 10 2 3h3l-2 3 1 3-4-2-3 2 1-3-2-3h3z"/>',
  ancient: '<path fill="#6e587e" d="M10 3h4v4h4v3h3v8h-4v4H7v-4H3v-8h3V7h4z"/><path fill="#b792ce" d="M7 9h10v3h2v5h-4v3H8v-3H5v-5h2z"/><path fill="#ffdc7b" d="M11 10h3v3h3v2h-3v3h-3v-3H8v-2h3z"/>',
  hay: '<path fill="#b58b45" d="M3 7h18v14H3z"/><path fill="#ebc66a" d="M4 8h16v11H4zM7 3h2v4H7zm5-2h2v6h-2zm5 3h2v3h-2z"/><path fill="#a3793e" d="M8 7h2v14H8zm6 0h2v14h-2z"/>',
  water: '<path fill="#437c91" d="M7 8h12v13H5V11H2V8h3v3h2zM17 3h6v11h-4v-3h2V5h-4z"/><path fill="#8bc3cc" d="M7 10h10v9H7z"/><path fill="#d2e5db" d="M8 11h3v6H8z"/><path fill="#6aabc2" d="M1 3h3v4H1zM5 1h3v4H5z"/>',
  sickle: '<path fill="#87643f" d="m3 20 10-11 3 3L6 23H3z"/><path fill="#718590" d="M10 1h9v3h3v9h-3v4h-3v-3h3V6h-3V4h-6V2H6V1z"/><path fill="#c6d6cf" d="M10 2h8v3h3v7h-2V6h-3V4h-6z"/>',
  chicken: '<path fill="#a66e45" d="M9 3h7v4h4v4h3v3h-4v5h-3v3H6v-3H3v-8H1V8h5v3h2V6h1z"/><path fill="#fff5d9" d="M10 5h6v4h3v8h-4v3H7v-3H5v-5h4V8h1z"/><path fill="#da7963" d="M10 1h3v3h3v2h-6zM16 12h3v4h-3z"/><path fill="#dfaa48" d="M19 9h4v3h-4zM7 21h2v3H7zm7 0h2v3h-2z"/><path fill="#473f35" d="M15 7h2v2h-2z"/>',
  cow: '<path fill="#76634e" d="M5 6h12v3h5v11h-3v4h-3v-4H8v4H5v-4H2V9h3z"/><path fill="#fbefd6" d="M5 7h11v4h5v7H4V9h1z"/><path fill="#806854" d="M5 7h5v5H5zm7 5h4v5h-4z"/><path fill="#efc1ac" d="M1 3h10v8H1z"/><path fill="#fff2d5" d="M2 2h8v5H2z"/><path fill="#6b5745" d="M1 0h2v3H1zm8 0h2v3H9zM3 5h1v2H3zm4 0h1v2H7z"/>',
  home: '<path fill="#9b6f42" d="M2 9h2V7h3V5h3V2h4v3h3v2h3v2h2v4h-3v9H5v-9H2z"/><path fill="#e2ab53" d="M5 9h3V7h3V5h2v2h3v2h3v2H5z"/><path fill="#f1d49c" d="M7 12h10v8H7z"/><path fill="#956f49" d="M10 15h4v7h-4z"/>',
  bag: '<path fill="#896841" d="M8 2h8v4h4v4h2v12H2V10h2V6h4z"/><path fill="#d7ae6c" d="M9 3h6v4H9zM5 9h14v11H5z"/><path fill="#f2d294" d="M6 10h12v4H6z"/><path fill="#8b7549" d="M10 12h4v5h-4z"/>',
  town: '<path fill="#876249" d="M1 7h22v3H1zM4 10h2v14H4zm14 0h2v14h-2z"/><path fill="#d4a266" d="M3 3h18v4H3zM6 10h12v11H6z"/><path fill="#fff0c1" d="M8 12h8v7H8z"/><path fill="#a8804c" d="M9 14h6v1H9zm0 3h4v1H9z"/>',
  gear: '<path fill="#7c8a7b" d="M9 1h6v4h4v4h4v6h-4v4h-4v4H9v-4H5v-4H1V9h4V5h4z"/><path fill="#d6ddbd" d="M8 8h8v8H8z"/><path fill="#657260" d="M10 10h4v4h-4z"/>',
  heart: '<path fill="#bd6960" d="M2 4h7v3h6V4h7v10h-4v4h-3v4H9v-4H6v-4H2z"/><path fill="#eea29a" d="M4 6h4v4H4z"/>',
  clock: '<path fill="#967542" d="M7 2h10v3h4v14h-4v3H7v-3H3V5h4z"/><path fill="#fff0c9" d="M8 4h8v3h3v10h-3v3H8v-3H5V7h3z"/><path fill="#967542" d="M11 6h2v7h5v2h-7z"/>',
  mute: '<path fill="#8a7255" d="M2 9h5l6-6v18l-6-6H2z"/><path d="m16 8 6 8m0-8-6 8" fill="none" stroke="#a5503d" stroke-width="2.5" stroke-linecap="square"/>',
  sound: '<path fill="#8a7255" d="M2 9h5l6-6v18l-6-6H2zM16 7h2v10h-2zm4-3h2v16h-2z"/>',
  save: '<path fill="#8c785d" d="M3 2h15l4 4v16H2V2z"/><path fill="#d0d7bd" d="M6 3h10v6H6zM6 13h12v8H6z"/><path fill="#8c785d" d="M13 3h2v5h-2zM8 15h8v1H8zm0 3h8v1H8z"/>',
  rod: '<path fill="#927043" d="M3 21 17 3l3 2L6 23z"/><path fill="#c3d9cd" d="M17 2h5v13h-1V3h-4z"/><path fill="#dd8370" d="M20 15h3v4h-3z"/>',
  plus: '<path fill="currentColor" d="M10 3h4v7h7v4h-7v7h-4v-7H3v-4h7z"/>',
  leaf: '<path fill="#587b46" d="M3 3h12v3h4v4h3v10H12v-3H8v-4H5V9H3z"/><path fill="#a4c26e" d="M6 5h7v3h4v4h3v5h-6v-3h-4v-4H7z"/>',
  barn: '<path fill="#8c654b" d="M1 8h3V5h4V2h8v3h4v3h3v4h-3v10H4V12H1z"/><path fill="#d88269" d="M5 10h14v10H5z"/><path fill="#f4dfb2" d="M8 12h8v9H8z"/><path fill="#aa6952" d="M10 14h4v7h-4z"/>'
};
export function icon(name: string, size = 24) {
  const asset = itemAssets[name as keyof typeof itemAssets];
  if (asset) return `<img class="icon bitmap-icon icon-${name}" src="${asset}" width="${size}" height="${size}" alt="" aria-hidden="true" draggable="false">`;
  return `<svg class="icon icon-${name}" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true" shape-rendering="crispEdges">${shapes[name] || shapes.star}</svg>`; }
