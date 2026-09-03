import { SlideType } from "../enums/slide.enum";

export interface Slide {
    id: string;
    title: string;
    caption: string;
    badge_text?: string | null;
    cta_label: string | null;
    redirect_url: string | null;
    coupon_code?: string | null;
    image_url: string;
    text_color?: string | null;
    button_color?: string | null;
    type: SlideType;
    priority: number;
    active: boolean;
    start_at?: string | null;
    end_at?: string | null;
    created_at: string;
    updated_at?: string | null;
    deleted_at?: string | null;
}