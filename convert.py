#!/usr/bin/env python3
"""
Data Conversion Script for BotanBot
====================================

This script converts XML data from three sources into normalized JSON format:
1. Client addresses (susko.ai/Adressen/*.XML) -> individual client JSON files
2. Articles (susko.ai/Artikel/*.xml) -> master products.json file
3. Order history (susko.ai/History/AdresseHistory-Komplett.xml) -> integrated into client files

Output:
- data/{client_number}.json - Individual client files with profile and order history
- products.json - Master product catalog
"""

import xml.etree.ElementTree as ET
import json
import os
import glob
import re
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Any, Optional


class DataConverter:
    """Main class for converting XML data to normalized JSON format"""
    
    def __init__(self, base_path: str = "."):
        """Initialize the converter with base path"""
        self.base_path = Path(base_path)
        self.susko_path = self.base_path / "susko.ai"
        self.data_path = self.base_path / "data"
        
        # Ensure data directory exists
        self.data_path.mkdir(exist_ok=True)
        
        # Data containers
        self.clients = {}
        self.products = {}
        self.order_history = {}
    
    def extract_cdata_value(self, element) -> str:
        """Extract CDATA value from XML element, handling empty values"""
        if element is None:
            return ""
        text = element.text
        if text is None or text.strip() == "":
            return ""
        return text.strip()
    
    def parse_boolean(self, value: str) -> bool:
        """Parse German boolean values to Python boolean"""
        return value.lower() in ["ja", "true", "1"]
    
    def parse_float(self, value: str) -> Optional[float]:
        """Parse float value, handling German decimal format and empty values"""
        if not value or value.strip() == "":
            return None
        try:
            # Replace German decimal separator
            normalized_value = value.replace(",", ".")
            return float(normalized_value)
        except ValueError:
            return None
    
    def parse_date(self, value: str) -> Optional[str]:
        """Parse date value and convert to ISO format"""
        if not value or value.strip() == "":
            return None
        try:
            # Handle German date format DD.MM.YYYY
            if "." in value:
                date_obj = datetime.strptime(value, "%d.%m.%Y")
                return date_obj.isoformat().split("T")[0]
            return value
        except ValueError:
            return value
    
    def load_clients(self):
        """Load all client data from address XML files"""
        print("Loading client data...")
        address_files = glob.glob(str(self.susko_path / "Adressen" / "*.XML"))
        
        for file_path in address_files:
            try:
                tree = ET.parse(file_path)
                root = tree.getroot()
                
                address_elem = root.find("Adresse")
                if address_elem is None:
                    continue
                
                # Extract client number
                adr_nr_elem = address_elem.find("AdrNr")
                if adr_nr_elem is None:
                    continue
                
                client_number = self.extract_cdata_value(adr_nr_elem)
                if not client_number:
                    continue
                
                # Extract client information
                client_data = {
                    "client_number": client_number,
                    "search_term": self.extract_cdata_value(address_elem.find("SuchBeg")),
                    "status": self.extract_cdata_value(address_elem.find("Status")),
                    "tax_number": self.extract_cdata_value(address_elem.find("SteuNr")),
                    "vat_id": self.extract_cdata_value(address_elem.find("UStId")),
                    "is_blocked": self.parse_boolean(self.extract_cdata_value(address_elem.find("GspKz"))),
                    "price_group": self.extract_cdata_value(address_elem.find("ArtPrGrp")),
                    "billing_address": {
                        "salutation": self.extract_cdata_value(address_elem.find("Re_Na1")),
                        "name": self.extract_cdata_value(address_elem.find("Re_Na2")),
                        "name3": self.extract_cdata_value(address_elem.find("Re_Na3")),
                        "street": self.extract_cdata_value(address_elem.find("Re_Str")),
                        "city": self.extract_cdata_value(address_elem.find("Re_Ort")),
                        "postal_code": self.extract_cdata_value(address_elem.find("Re_Plz")),
                        "country": self.extract_cdata_value(address_elem.find("Re_Land")),
                        "phone": self.extract_cdata_value(address_elem.find("Re_Tel")),
                        "fax": self.extract_cdata_value(address_elem.find("Re_Fax")),
                        "email": self.extract_cdata_value(address_elem.find("Re_Email1"))
                    },
                    "delivery_address": {
                        "salutation": self.extract_cdata_value(address_elem.find("Li_Na1")),
                        "name": self.extract_cdata_value(address_elem.find("Li_Na2")),
                        "name3": self.extract_cdata_value(address_elem.find("Li_Na3")),
                        "street": self.extract_cdata_value(address_elem.find("Li_Str")),
                        "city": self.extract_cdata_value(address_elem.find("Li_Ort")),
                        "postal_code": self.extract_cdata_value(address_elem.find("Li_Plz")),
                        "country": self.extract_cdata_value(address_elem.find("Li_Land")),
                        "phone": self.extract_cdata_value(address_elem.find("Li_Tel")),
                        "fax": self.extract_cdata_value(address_elem.find("Li_Fax")),
                        "email": self.extract_cdata_value(address_elem.find("Li_Email1"))
                    },
                    "delivery_schedule": {
                        "monday": self.extract_cdata_value(address_elem.find("Sel12")),
                        "tuesday": self.extract_cdata_value(address_elem.find("Sel13")),
                        "wednesday": self.extract_cdata_value(address_elem.find("Sel14")),
                        "thursday": self.extract_cdata_value(address_elem.find("Sel15")),
                        "friday": self.extract_cdata_value(address_elem.find("Sel16")),
                        "saturday": self.extract_cdata_value(address_elem.find("Sel17"))
                    },
                    "settings": {
                        "webshop_enabled": self.parse_boolean(self.extract_cdata_value(address_elem.find("Sel70"))),
                        "ds_addresses": self.parse_boolean(self.extract_cdata_value(address_elem.find("Sel29"))),
                        "no_pickup_app": self.parse_boolean(self.extract_cdata_value(address_elem.find("Sel91"))),
                        "minimum_order_value": self.parse_float(self.extract_cdata_value(address_elem.find("Sel94"))),
                        "articles_not_in_history": self.extract_cdata_value(address_elem.find("Sel18"))
                    },
                    "additional_addresses": []
                }
                
                # Extract additional addresses if present
                anschriften_liste = address_elem.find("AnschriftenListe")
                if anschriften_liste is not None:
                    for anschrift in anschriften_liste.findall("Anschriften"):
                        addr_data = {
                            "address_number": self.extract_cdata_value(anschrift.find("AnsNr")),
                            "salutation": self.extract_cdata_value(anschrift.find("Na1")),
                            "name": self.extract_cdata_value(anschrift.find("Na2")),
                            "name3": self.extract_cdata_value(anschrift.find("Na3")),
                            "street": self.extract_cdata_value(anschrift.find("Str")),
                            "city": self.extract_cdata_value(anschrift.find("Ort")),
                            "postal_code": self.extract_cdata_value(anschrift.find("Plz")),
                            "country": self.extract_cdata_value(anschrift.find("Land")),
                            "phone": self.extract_cdata_value(anschrift.find("Tel")),
                            "fax": self.extract_cdata_value(anschrift.find("Fax")),
                            "email": self.extract_cdata_value(anschrift.find("Email1")),
                            "is_default_billing": self.parse_boolean(self.extract_cdata_value(anschrift.find("StdReKz"))),
                            "is_default_delivery": self.parse_boolean(self.extract_cdata_value(anschrift.find("StdLiKz")))
                        }
                        client_data["additional_addresses"].append(addr_data)
                
                self.clients[client_number] = client_data
                
            except ET.ParseError as e:
                print(f"Error parsing {file_path}: {e}")
            except Exception as e:
                print(f"Unexpected error processing {file_path}: {e}")
        
        print(f"Loaded {len(self.clients)} clients")
    
    def load_products(self):
        """Load all product data from article XML files"""
        print("Loading product data...")
        article_files = glob.glob(str(self.susko_path / "Artikel" / "*.xml"))
        
        for file_path in article_files:
            try:
                tree = ET.parse(file_path)
                root = tree.getroot()
                
                article_elem = root.find("Artikel")
                if article_elem is None:
                    continue
                
                # Extract article number
                art_nr_elem = article_elem.find("ArtNr")
                if art_nr_elem is None:
                    continue
                
                article_number = self.extract_cdata_value(art_nr_elem)
                if not article_number:
                    continue
                
                # Extract product information
                product_data = {
                    "article_number": article_number,
                    "barcode": self.extract_cdata_value(article_elem.find("BarCd")),
                    "short_description": self.extract_cdata_value(article_elem.find("KuBez1")),
                    "long_description": self.extract_cdata_value(article_elem.find("KuBez6")),
                    "weight": self.parse_float(self.extract_cdata_value(article_elem.find("Gew"))),
                    "unit": self.extract_cdata_value(article_elem.find("Einh")),
                    "price_quantity": self.parse_float(self.extract_cdata_value(article_elem.find("PreisMge"))),
                    "tax_key": self.extract_cdata_value(article_elem.find("StSchl")),
                    "product_group": {
                        "number": self.extract_cdata_value(article_elem.find("WgrNr")),
                        "description": self.extract_cdata_value(article_elem.find("WgrNrInfo"))
                    },
                    "pricing": {
                        "vk0_net_price": self.parse_float(self.extract_cdata_value(article_elem.find("Vk0_PreisNt"))),
                        "vk0_special_price": self.parse_float(self.extract_cdata_value(article_elem.find("Vk0_SPr"))),
                        "vk0_special_from": self.parse_date(self.extract_cdata_value(article_elem.find("Vk0_SVonDat"))),
                        "vk0_special_to": self.parse_date(self.extract_cdata_value(article_elem.find("Vk0_SBisDat"))),
                        "vk4_net_price": self.parse_float(self.extract_cdata_value(article_elem.find("Vk4_PreisNt"))),
                        "vk5_net_price": self.parse_float(self.extract_cdata_value(article_elem.find("Vk5_PreisNt")))
                    },
                    "delivery_time_days": self.parse_float(self.extract_cdata_value(article_elem.find("Lief_LiefZt"))),
                    "attributes": {
                        "has_weight": self.parse_boolean(self.extract_cdata_value(article_elem.find("Sel2"))),
                        "is_order_article": self.parse_boolean(self.extract_cdata_value(article_elem.find("Sel3"))),
                        "pre_order_only": self.parse_boolean(self.extract_cdata_value(article_elem.find("Sel4"))),
                        "is_blocked": self.parse_boolean(self.extract_cdata_value(article_elem.find("GspKz"))),
                        "webshop_enabled": self.parse_boolean(self.extract_cdata_value(article_elem.find("WShopKz"))),
                        "frozen": self.parse_boolean(self.extract_cdata_value(article_elem.find("Sel27")))
                    },
                    "restaurant_categories": {
                        "doener_imbiss": self.parse_boolean(self.extract_cdata_value(article_elem.find("Sel81"))),
                        "wurst_imbiss": self.parse_boolean(self.extract_cdata_value(article_elem.find("Sel82"))),
                        "cafe": self.parse_boolean(self.extract_cdata_value(article_elem.find("Sel83"))),
                        "italiener": self.parse_boolean(self.extract_cdata_value(article_elem.find("Sel84"))),
                        "grieche": self.parse_boolean(self.extract_cdata_value(article_elem.find("Sel85"))),
                        "asiatische_kueche": self.parse_boolean(self.extract_cdata_value(article_elem.find("Sel86"))),
                        "international": self.parse_boolean(self.extract_cdata_value(article_elem.find("Sel87"))),
                        "orient": self.parse_boolean(self.extract_cdata_value(article_elem.find("Sel88"))),
                        "balkan": self.parse_boolean(self.extract_cdata_value(article_elem.find("Sel89"))),
                        "supermaerkte": self.parse_boolean(self.extract_cdata_value(article_elem.find("Sel90"))),
                        "baeckerei": self.parse_boolean(self.extract_cdata_value(article_elem.find("Sel91"))),
                        "kiosk": self.parse_boolean(self.extract_cdata_value(article_elem.find("Sel92"))),
                        "pizza_lieferdienst": self.parse_boolean(self.extract_cdata_value(article_elem.find("Sel93"))),
                        "burger_manufaktur": self.parse_boolean(self.extract_cdata_value(article_elem.find("Sel94"))),
                        "bars_und_clubs": self.parse_boolean(self.extract_cdata_value(article_elem.find("Sel95")))
                    },
                    "images": [
                        self.extract_cdata_value(article_elem.find("BildDatei1")),
                        self.extract_cdata_value(article_elem.find("BildDatei2")),
                        self.extract_cdata_value(article_elem.find("BildDatei3")),
                        self.extract_cdata_value(article_elem.find("BildDatei4")),
                        self.extract_cdata_value(article_elem.find("BildDatei5"))
                    ],
                    "packaging": {
                        "unit_factor": self.extract_cdata_value(article_elem.find("EinhFakt")),
                        "quantity_factor": self.extract_cdata_value(article_elem.find("MgeFakt"))
                    }
                }
                
                # Remove empty images
                product_data["images"] = [img for img in product_data["images"] if img]
                
                self.products[article_number] = product_data
                
            except ET.ParseError as e:
                print(f"Error parsing {file_path}: {e}")
            except Exception as e:
                print(f"Unexpected error processing {file_path}: {e}")
        
        print(f"Loaded {len(self.products)} products")
    
    def load_order_history(self):
        """Load order history and organize by client"""
        print("Loading order history...")
        history_file = self.susko_path / "History" / "AdresseHistory-Komplett.xml"
        
        if not history_file.exists():
            print(f"History file not found: {history_file}")
            return
        
        try:
            tree = ET.parse(history_file)
            root = tree.getroot()
            
            for history_elem in root.findall("History"):
                # Extract order information
                adr_nr_elem = history_elem.find("AdrNr")
                art_nr_elem = history_elem.find("ArtNr")
                
                if adr_nr_elem is None or art_nr_elem is None:
                    continue
                
                client_number = self.extract_cdata_value(adr_nr_elem)
                article_number = self.extract_cdata_value(art_nr_elem)
                
                if not client_number or not article_number:
                    continue
                
                order_data = {
                    "article_number": article_number,
                    "date": self.parse_date(self.extract_cdata_value(history_elem.find("Dat"))),
                    "booking_quantity": self.parse_float(self.extract_cdata_value(history_elem.find("BuchMge"))),
                    "quantity": self.parse_float(self.extract_cdata_value(history_elem.find("Mge"))),
                    "unit": self.extract_cdata_value(history_elem.find("Einh"))
                }
                
                # Initialize client history if not exists
                if client_number not in self.order_history:
                    self.order_history[client_number] = []
                
                self.order_history[client_number].append(order_data)
                
        except ET.ParseError as e:
            print(f"Error parsing history file: {e}")
        except Exception as e:
            print(f"Unexpected error processing history file: {e}")
        
        # Sort order history by date for each client
        for client_number in self.order_history:
            self.order_history[client_number].sort(
                key=lambda x: x["date"] or "1900-01-01", 
                reverse=True
            )
        
        print(f"Loaded order history for {len(self.order_history)} clients")
    
    def create_client_files(self):
        """Create individual JSON files for each client"""
        print("Creating client JSON files...")
        
        created_files = 0
        for client_number, client_data in self.clients.items():
            try:
                # Get order history for this client
                orders = self.order_history.get(client_number, [])
                
                # Enrich order history with product information
                enriched_orders = []
                for order in orders:
                    enriched_order = order.copy()
                    article_info = self.products.get(order["article_number"])
                    if article_info:
                        enriched_order["article_info"] = {
                            "short_description": article_info["short_description"],
                            "long_description": article_info["long_description"],
                            "product_group": article_info["product_group"]["description"],
                            "unit": article_info["unit"]
                        }
                    enriched_orders.append(enriched_order)
                
                # Calculate order statistics
                total_orders = len(enriched_orders)
                unique_articles = len(set(order["article_number"] for order in enriched_orders))
                recent_orders = [order for order in enriched_orders if order["date"] and order["date"] >= "2025-01-01"]
                
                # Create comprehensive client file
                client_file_data = {
                    "metadata": {
                        "generated_at": datetime.now().isoformat(),
                        "client_number": client_number,
                        "data_source": "BotanBot XML Export"
                    },
                    "client_profile": client_data,
                    "order_statistics": {
                        "total_orders": total_orders,
                        "unique_articles_ordered": unique_articles,
                        "recent_orders_count": len(recent_orders),
                        "last_order_date": enriched_orders[0]["date"] if enriched_orders else None
                    },
                    "order_history": enriched_orders
                }
                
                # Write client file
                client_file_path = self.data_path / f"{client_number}.json"
                with open(client_file_path, 'w', encoding='utf-8') as f:
                    json.dump(client_file_data, f, ensure_ascii=False, indent=2)
                
                created_files += 1
                
            except Exception as e:
                print(f"Error creating file for client {client_number}: {e}")
        
        print(f"Created {created_files} client JSON files")
    
    def create_products_file(self):
        """Create master products JSON file"""
        print("Creating products JSON file...")
        
        try:
            # Organize products by category for better AI readability
            categorized_products = {}
            uncategorized_products = []
            
            for article_number, product_data in self.products.items():
                product_group = product_data["product_group"]["description"]
                if product_group:
                    if product_group not in categorized_products:
                        categorized_products[product_group] = []
                    categorized_products[product_group].append(product_data)
                else:
                    uncategorized_products.append(product_data)
            
            # Create comprehensive products file
            products_file_data = {
                "metadata": {
                    "generated_at": datetime.now().isoformat(),
                    "total_products": len(self.products),
                    "categories_count": len(categorized_products),
                    "data_source": "BotanBot XML Export"
                },
                "product_categories": categorized_products,
                "uncategorized_products": uncategorized_products,
                "all_products": list(self.products.values())
            }
            
            # Write products file
            products_file_path = self.base_path / "products.json"
            with open(products_file_path, 'w', encoding='utf-8') as f:
                json.dump(products_file_data, f, ensure_ascii=False, indent=2)
            
            print(f"Created products.json with {len(self.products)} products")
            
        except Exception as e:
            print(f"Error creating products file: {e}")
    
    def generate_summary_report(self):
        """Generate a summary report of the conversion"""
        report = {
            "conversion_summary": {
                "timestamp": datetime.now().isoformat(),
                "total_clients": len(self.clients),
                "total_products": len(self.products),
                "total_clients_with_history": len(self.order_history),
                "files_created": {
                    "client_files": len(self.clients),
                    "products_file": 1
                }
            },
            "data_quality_notes": [
                "All dates converted to ISO format (YYYY-MM-DD)",
                "German decimal separators (,) converted to international format (.)",
                "Boolean values normalized to true/false",
                "Empty CDATA values converted to empty strings or null",
                "Order history sorted by date (most recent first)",
                "Products categorized by product groups for better organization"
            ]
        }
        
        # Write summary report
        summary_file_path = self.base_path / "conversion_summary.json"
        with open(summary_file_path, 'w', encoding='utf-8') as f:
            json.dump(report, f, ensure_ascii=False, indent=2)
        
        print("Generated conversion summary report")
        return report
    
    def convert_all(self):
        """Execute the complete conversion process"""
        print("Starting data conversion process...")
        print("=" * 50)
        
        # Load all data
        self.load_clients()
        self.load_products()
        self.load_order_history()
        
        # Create output files
        self.create_client_files()
        self.create_products_file()
        
        # Generate summary
        summary = self.generate_summary_report()
        
        print("=" * 50)
        print("Conversion completed successfully!")
        print(f"• {summary['conversion_summary']['total_clients']} client files created in 'data/' directory")
        print(f"• 1 products file created as 'products.json'")
        print(f"• {summary['conversion_summary']['total_clients_with_history']} clients have order history")
        print("• Summary report saved as 'conversion_summary.json'")
        
        return summary


def main():
    """Main execution function"""
    try:
        # Initialize converter
        converter = DataConverter()
        
        # Run conversion
        summary = converter.convert_all()
        
        return summary
        
    except Exception as e:
        print(f"Fatal error during conversion: {e}")
        raise


if __name__ == "__main__":
    main()
