# The API models are read with Gson by field name, so their names must survive shrinking.
-keep class com.levoy.app.data.** { *; }
-keepattributes Signature, *Annotation*, InnerClasses, EnclosingMethod
-keep class com.google.gson.reflect.TypeToken { *; }
-keep class * extends com.google.gson.reflect.TypeToken
-keepclassmembers class * { @com.google.gson.annotations.SerializedName <fields>; }
-dontwarn okhttp3.**
-dontwarn javax.annotation.**
