// 0 = kosong, 1 = selesai, 2 = terkunci (terlihat tapi tidak bisa diklik)
export type SlotValue = 0 | 1 | 2;

export interface ItemState {
  slots: SlotValue[];
  at: number;
}

export interface TemplateData {
  markdown: string;
  updatedAt: number;
}

export interface StoreData {
  template: TemplateData | null;
  state: Record<string, ItemState>;
}

export interface DocMeta {
  slug: string;
  title: string;
  updatedAt: number;
}
