version "1"

# People
person "Customer" [description="End user browsing and purchasing products"]
person "Admin" [description="Internal staff managing catalog and orders"]

# External systems
system "Payment Gateway" [external="true", description="Third-party payment processor (e.g. Stripe)"]
system "Email Service" [external="true", description="Transactional email delivery (e.g. SendGrid)"]

# Core platform
system "E-Commerce Platform" {
  container "Web Storefront" [technology="Next.js", subtype="user-interface", description="Customer-facing shopping experience"]
  container "Admin Dashboard" [technology="React", subtype="user-interface", description="Catalog and order management UI"]
  container "API Gateway" [technology="Node.js / Express", subtype="backend-service", description="Routes requests to internal services"]
  container "Order Service" [technology="Node.js", subtype="backend-service", description="Handles order lifecycle"]
  container "Catalog Service" [technology="Node.js", subtype="backend-service", description="Manages products and inventory"]
  container "User Service" [technology="Node.js", subtype="backend-service", description="Authentication and user profiles"]
  container "Orders DB" [technology="PostgreSQL", subtype="database"]
  container "Catalog DB" [technology="PostgreSQL", subtype="database"]
  container "Session Cache" [technology="Redis", subtype="database", description="Short-lived session and cart data"]
}

# Relationships — customers
"Customer" -> "Web Storefront" [type="uses", label="Browses and shops"]
"Web Storefront" -> "API Gateway" [type="calls", label="REST / GraphQL"]

# Relationships — admin
"Admin" -> "Admin Dashboard" [type="uses", label="Manages catalog and orders"]
"Admin Dashboard" -> "API Gateway" [type="calls", label="REST"]

# Relationships — internal services
"API Gateway" -> "Order Service" [type="calls"]
"API Gateway" -> "Catalog Service" [type="calls"]
"API Gateway" -> "User Service" [type="calls"]
"API Gateway" -> "Session Cache" [type="reads/writes", label="Session lookup"]

"Order Service" -> "Orders DB" [type="reads/writes"]
"Order Service" -> "Payment Gateway" [type="calls", label="Charge card"]
"Order Service" -> "Email Service" [type="calls", label="Send confirmation"]

"Catalog Service" -> "Catalog DB" [type="reads/writes"]

"User Service" -> "Orders DB" [type="reads"]
