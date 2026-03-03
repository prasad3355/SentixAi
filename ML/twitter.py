import re
import pickle
import numpy as np
import pandas as pd
from pathlib import Path
import nltk
from nltk.corpus import stopwords
from nltk.stem.porter import PorterStemmer
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.model_selection import train_test_split
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score

nltk.download("stopwords", quiet=True)
stop_words = set(stopwords.words("english"))

print(list(stop_words)[:10])
BASE_DIR = Path(__file__).resolve().parent
DATASET_PATH = BASE_DIR / "data.csv"


def load_dataset(path: Path) -> pd.DataFrame:
 df_raw = pd.read_csv(path, encoding="ISO-8859-1", header=None)

 # Sentiment140 format: target,id,date,flag,user,text
 if df_raw.shape[1] >= 6:
  df = pd.DataFrame(
   {
    "target": df_raw.iloc[:, 0].replace({4: 1}),
    "text": df_raw.iloc[:, 5].fillna("").astype(str),
   }
  )
  df = df[df["target"].isin([0, 1])]
  return df

 # Twitter entity format: id,topic,sentiment,text
 if df_raw.shape[1] >= 4:
  mapped = (
   df_raw.iloc[:, 2]
   .astype(str)
   .str.strip()
   .str.lower()
   .map({"positive": 1, "negative": 0, "neutral": np.nan, "irrelevant": np.nan})
  )
  df = pd.DataFrame(
   {
    "target": mapped,
    "text": df_raw.iloc[:, 3].fillna("").astype(str),
   }
  )
  df = df.dropna(subset=["target"])
  df["target"] = df["target"].astype(int)
  return df

 raise ValueError("Unsupported CSV format. Expected 4 or 6 columns.")


df = load_dataset(DATASET_PATH)
print(df.head())
print(df.isnull().sum())
print(df["target"].value_counts())

#steamming(process of reducing word into its key word) || 1st step

port_stem = PorterStemmer()


def stemming(content):

 stemmed_content = re.sub('[^a-zA-Z]', ' ', content)
 stemmed_content = stemmed_content.lower()
 stemmed_content = stemmed_content.split()
 stemmed_content = [port_stem.stem(word) for word in stemmed_content if word not in stop_words]
 stemmed_content = ' '.join(stemmed_content)
 return stemmed_content

df["stemed_content"] = df["text"].apply(stemming)
print(df["stemed_content"])
print(df.head())
print(df["target"])

#fitting stemming data into another object || 2nd step

x = df["stemed_content"].values
y = df["target"].values

print(x)

print(y)

#split data into training and test data || 3rd step

x_train,x_test,y_train,y_test = train_test_split(x,y, test_size=0.2, stratify=y,random_state=2)
print(x.shape)
print(x_train.shape)
print(x_test.shape)

#feature extraction (converting text to numerical data using Tfidfvectorizer) || 4th step

vectorizer = TfidfVectorizer()

x_train = vectorizer.fit_transform(x_train)
x_test = vectorizer.transform(x_test)

print(x_train)
print(x_test)

#training the ml model using logistic regression || 5th step

model = LogisticRegression(max_iter=1000)
model.fit(x_train,y_train)

#model evaluation using accuracy score || 6th step

x_prediction = model.predict(x_train)
train_data_accuracy = accuracy_score(y_train,x_prediction)
print("accuracy score:",train_data_accuracy)
#model accuracy is 99% (0.99812265625)

#saving the modelfile and vectorizer file || 7th step

filename = 'Twitter_trained_model.sav'
pickle.dump(model,open(filename,'wb'))
pickle.dump(vectorizer,open("vectorizer.sav",'wb'))



#using the saved model for future prediction || 8th step

loaded_model = pickle.load(open('Twitter_trained_model.sav','rb'))
loaded_vectorizer = pickle.load(open('vectorizer.sav', 'rb'))
print("everything ok")
x_new = x_test[3]
print(y_test[3])

prediction = loaded_model.predict(x_new.reshape(1,-1))
print(prediction)

if(prediction[0] == 0):
 print("negative twite")
else:
 print("positive twite")
