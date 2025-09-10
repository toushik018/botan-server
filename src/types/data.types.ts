/**
 * Core data types based on the XML structure from convert.py
 */

// Client/Address related types
export interface BillingAddress {
    salutation: string;
    name: string;
    name3: string;
    street: string;
    city: string;
    postal_code: string;
    country: string;
    phone: string;
    fax: string;
    email: string;
}

export interface DeliveryAddress extends BillingAddress { }

export interface DeliverySchedule {
    monday: string;
    tuesday: string;
    wednesday: string;
    thursday: string;
    friday: string;
    saturday: string;
}

export interface ClientSettings {
    webshop_enabled: boolean;
    ds_addresses: boolean;
    no_pickup_app: boolean;
    minimum_order_value: number | null;
    articles_not_in_history: string;
}

export interface AdditionalAddress {
    address_number: string;
    salutation: string;
    name: string;
    name3: string;
    street: string;
    city: string;
    postal_code: string;
    country: string;
    phone: string;
    fax: string;
    email: string;
    is_default_billing: boolean;
    is_default_delivery: boolean;
}

export interface ClientProfile {
    client_number: string;
    search_term: string;
    status: string;
    tax_number: string;
    vat_id: string;
    is_blocked: boolean;
    price_group: string;
    billing_address: BillingAddress;
    delivery_address: DeliveryAddress;
    delivery_schedule: DeliverySchedule;
    settings: ClientSettings;
    additional_addresses: AdditionalAddress[];
}

// Product related types
export interface ProductGroup {
    number: string;
    description: string;
}

export interface ProductPricing {
    vk0_net_price: number | null;
    vk0_special_price: number | null;
    vk0_special_from: string | null;
    vk0_special_to: string | null;
    vk4_net_price: number | null;
    vk5_net_price: number | null;
}

export interface ProductAttributes {
    has_weight: boolean;
    is_order_article: boolean;
    pre_order_only: boolean;
    is_blocked: boolean;
    webshop_enabled: boolean;
    frozen: boolean;
}

export interface RestaurantCategories {
    doener_imbiss: boolean;
    wurst_imbiss: boolean;
    cafe: boolean;
    italiener: boolean;
    grieche: boolean;
    asiatische_kueche: boolean;
    international: boolean;
    orient: boolean;
    balkan: boolean;
    supermaerkte: boolean;
    baeckerei: boolean;
    kiosk: boolean;
    pizza_lieferdienst: boolean;
    burger_manufaktur: boolean;
    bars_und_clubs: boolean;
}

export interface ProductPackaging {
    unit_factor: string;
    quantity_factor: string;
}

export interface Product {
    article_number: string;
    barcode: string;
    short_description: string;
    long_description: string;
    weight: number | null;
    unit: string;
    price_quantity: number | null;
    tax_key: string;
    product_group: ProductGroup;
    pricing: ProductPricing;
    delivery_time_days: number | null;
    attributes: ProductAttributes;
    restaurant_categories: RestaurantCategories;
    images: string[];
    packaging: ProductPackaging;
}

// Order history types
export interface ArticleInfo {
    short_description: string;
    long_description: string;
    product_group: string;
    unit: string;
}

export interface OrderItem {
    article_number: string;
    date: string | null;
    booking_quantity: number | null;
    quantity: number | null;
    unit: string;
    article_info?: ArticleInfo;
}

export interface OrderStatistics {
    total_orders: number;
    unique_articles_ordered: number;
    recent_orders_count: number;
    last_order_date: string | null;
}

// Complete client data structure
export interface ClientData {
    metadata: {
        generated_at: string;
        client_number: string;
        data_source: string;
    };
    client_profile: ClientProfile;
    order_statistics: OrderStatistics;
    order_history: OrderItem[];
}

// Products file structure
export interface ProductsData {
    metadata: {
        generated_at: string;
        total_products: number;
        categories_count: number;
        data_source: string;
    };
    product_categories: Record<string, Product[]>;
    uncategorized_products: Product[];
    all_products: Product[];
}

// Conversion summary structure
export interface ConversionSummary {
    conversion_summary: {
        timestamp: string;
        total_clients: number;
        total_products: number;
        total_clients_with_history: number;
        files_created: {
            client_files: number;
            products_file: number;
        };
    };
    data_quality_notes: string[];
}